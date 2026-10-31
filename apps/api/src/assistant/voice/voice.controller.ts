import { defaultAssistantConfig } from '../assistant-defaults';
import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, Public, RequireRole, SessionGuard } from '../../auth/session.guard';
import { PrismaService } from '../../common/prisma.service';
import { notFound, validation } from '../../common/errors';
import { parseInput } from '../../common/validation';
import { VoiceCatalogRegistry } from '../voice-catalog';
import { ConversationService } from '../conversation.service';
import { VoiceService } from './voice.service';
import { voiceEnabled } from './voice-enabled';

const startSchema = z.object({
  shop_id: z.number().int().positive(),
  sdp_offer: z.string().min(1).max(100000),
  lang: z.enum(['vi', 'en']).optional(),
  resume_conversation_id: z.string().uuid().optional(),
  item_id: z.number().int().positive().optional(),
});
const textStartSchema = z.object({
  shop_id: z.number().int().positive(),
  lang: z.enum(['vi', 'en']).optional(),
  resume_conversation_id: z.string().uuid().optional(),
  item_id: z.number().int().positive().optional(),
});
const unix = (date: Date) => Math.floor(date.getTime() / 1000);
const textSchema = z.object({ text: z.string().trim().min(1).max(4000) });

@Controller('api/v1/assistant')
@UseGuards(SessionGuard)
@RequireRole('BUYER')
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly conversations: ConversationService,
    private readonly prisma: PrismaService,
    private readonly catalog: VoiceCatalogRegistry,
  ) {}
  private enabled(): boolean {
    return voiceEnabled();
  }
  private async viewedItem(shopId: number, itemId?: number | null): Promise<number | null> {
    if (itemId == null) return null;
    const item = await this.prisma.item.findFirst({ where: { id: itemId, shopId, status: 'NORMAL', shop: { status: 'NORMAL' } }, select: { id: true } });
    if (!item) throw notFound('Product');
    return item.id;
  }
  /** The buyer's earlier messages in one of their own conversations with this shop, oldest first. */
  private async history(buyerId: number, shopId: number, resumeId?: string) {
    if (!resumeId) return undefined;
    const conversation = await this.prisma.conversation.findFirst({ where: { id: resumeId, buyerId, shopId }, select: { id: true } });
    if (!conversation) throw notFound('Conversation');
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId: resumeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return messages.reverse().map((message) => ({ role: message.role === 'USER' ? ('user' as const) : ('assistant' as const), text: message.text.trim() }));
  }
  @Get('shops/:shopId/conversations')
  async conversationList(@CurrentUser() user: User, @Param('shopId') shopIdParam: string) {
    const shopId = Number(shopIdParam);
    if (!Number.isInteger(shopId) || shopId <= 0) throw notFound('Shop');
    const rows = await this.prisma.conversation.findMany({
      where: { buyerId: user.id, shopId, messages: { some: {} } },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: {
        messages: { where: { role: 'USER' }, orderBy: { createdAt: 'asc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return {
      data: rows.map((row) => ({
        conversation_id: row.id,
        channel: row.channel,
        status: row.status,
        started_at: unix(row.startedAt),
        ended_at: row.endedAt ? unix(row.endedAt) : null,
        preview: row.messages[0]?.text.trim() ?? null,
        message_count: row._count.messages,
      })),
    };
  }
  @Get('conversations/:conversationId')
  async conversationDetail(@CurrentUser() user: User, @Param('conversationId') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const row = await this.prisma.conversation.findFirst({
      where: { id, buyerId: user.id },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        toolCalls: { where: { success: true, tool: { not: 'speech_check' } }, orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!row) throw notFound('Conversation');
    return {
      data: {
        conversation_id: row.id,
        shop_id: row.shopId,
        channel: row.channel,
        status: row.status,
        started_at: unix(row.startedAt),
        ended_at: row.endedAt ? unix(row.endedAt) : null,
        preview: row.messages.find((message) => message.role === 'USER')?.text.trim() ?? null,
        message_count: row._count.messages,
        messages: row.messages.map((message) => ({
          role: message.role === 'USER' ? 'user' : 'assistant',
          text: message.text.trim(),
          created_at: unix(message.createdAt),
        })),
        // Cards come from the stored tool results, the same data the buyer saw live.
        cards: row.toolCalls.flatMap((call) => {
          const card = (call.result as { card?: Record<string, unknown> } | null)?.card;
          return card ? [{ card, created_at: unix(call.createdAt) }] : [];
        }),
      },
    };
  }
  @Public()
  @Get('voices')
  async voices() {
    return { data: { voices: await this.catalog.list() } };
  }
  @Post('voice/sessions')
  async start(@CurrentUser() user: User, @Body() body: unknown, @Res() res: Response) {
    if (!this.enabled())
      return res
        .status(503)
        .json({ error: { code: 'assistant_unavailable', message: 'Voice assistant is unavailable' } });
    const input = parseInput(startSchema, body);
    const shop = await this.prisma.shop.findUnique({
      where: { id: input.shop_id },
      include: { assistantConfig: true },
    });
    if (!shop || shop.status !== 'NORMAL') throw notFound('Shop assistant');
    const config = shop.assistantConfig ?? defaultAssistantConfig(shop.name);
    if (config?.enabled === false)
      return res
        .status(503)
        .json({ error: { code: 'assistant_unavailable', message: 'Shop assistant is unavailable' } });
    const viewedItemId = await this.viewedItem(input.shop_id, input.item_id);
    const history = await this.history(user.id, input.shop_id, input.resume_conversation_id);
    const conversation = await this.conversations.start({ shopId: input.shop_id, buyerId: user.id, channel: 'VOICE', language: input.lang });
    try {
      const sdp = await this.voice.runtime.start(
        { conversationId: conversation.id, buyerId: user.id, shopId: input.shop_id, viewedItemId },
        {
          shopName: shop.name,
          tone: config.tone,
          greetingVi: config.greetingVi,
          greetingEn: config.greetingEn,
          voice: config.voice,
          language: input.lang,
          history,
        },
        input.sdp_offer,
      );
      return res.status(201).json({ data: { conversation_id: conversation.id, sdp_answer: sdp } });
    } catch (error) {
      await this.conversations.end(conversation.id);
      const busy = error instanceof Error && error.message === 'assistant_busy';
      return res.status(503).json({
        error: {
          code: busy ? 'assistant_busy' : 'assistant_unavailable',
          message: busy ? 'Voice assistant is busy' : 'Voice assistant is unavailable',
        },
      });
    }
  }
  @Post('text/sessions')
  async startText(@CurrentUser() user: User, @Body() body: unknown, @Res() res: Response) {
    if (!this.enabled()) return res.status(503).json({ error: { code: 'assistant_unavailable', message: 'Assistant is unavailable' } });
    const input = parseInput(textStartSchema, body);
    const shop = await this.prisma.shop.findUnique({ where: { id: input.shop_id }, include: { assistantConfig: true } });
    if (!shop || shop.status !== 'NORMAL') throw notFound('Shop assistant');
    const config = shop.assistantConfig ?? defaultAssistantConfig(shop.name);
    if (!config.enabled) return res.status(503).json({ error: { code: 'assistant_unavailable', message: 'Shop assistant is unavailable' } });
    const viewedItemId = await this.viewedItem(input.shop_id, input.item_id);
    const history = await this.history(user.id, input.shop_id, input.resume_conversation_id);
    const conversation = await this.conversations.start({ shopId: input.shop_id, buyerId: user.id, channel: 'TEXT', language: input.lang });
    try {
      await this.voice.runtime.startText({ conversationId: conversation.id, buyerId: user.id, shopId: input.shop_id, viewedItemId }, { shopName: shop.name, ...config, language: input.lang, history });
      return res.status(201).json({ data: { conversation_id: conversation.id } });
    } catch (error) {
      await this.conversations.end(conversation.id);
      const busy = error instanceof Error && error.message === 'assistant_busy';
      return res.status(503).json({ error: { code: busy ? 'assistant_busy' : 'assistant_unavailable', message: busy ? 'Assistant is busy' : 'Assistant is unavailable' } });
    }
  }
  @Post('voice/sessions/:conversationId/call')
  async startCall(@CurrentUser() user: User, @Param('conversationId') id: string, @Body() body: unknown, @Res() res: Response) {
    if (!this.enabled()) return res.status(503).json({ error: { code: 'assistant_unavailable', message: 'Assistant is unavailable' } });
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const input = parseInput(z.object({ sdp_offer: z.string().min(1).max(100000) }).strict(), body);
    await this.conversations.assertBuyer(id, user.id);
    try {
      const result = await this.voice.runtime.startCall(id, user.id, input.sdp_offer);
      return res.json({ data: { conversation_id: id, ...result } });
    } catch (error) {
      if (error instanceof Error && error.message === 'not_found') throw notFound('Conversation');
      const busy = error instanceof Error && error.message === 'assistant_busy';
      return res.status(busy ? 409 : 503).json({ error: { code: busy ? 'assistant_busy' : 'assistant_unavailable', message: busy ? 'Wait for the current reply or call to finish' : 'Voice call is unavailable; you can continue typing' } });
    }
  }
  @Post('voice/sessions/:conversationId/call/stop')
  async stopCall(@CurrentUser() user: User, @Param('conversationId') id: string, @Body() body: unknown) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const input = parseInput(z.object({ call_id: z.string().uuid().optional() }).strict(), body ?? {});
    await this.conversations.assertBuyer(id, user.id);
    try { await this.voice.runtime.stopCall(id, user.id, input.call_id); }
    catch (error) {
      if (error instanceof Error && error.message === 'not_found') throw notFound('Conversation');
      throw validation('Could not finish the voice call; please retry');
    }
    return { data: { ok: true } };
  }
  @Patch('voice/sessions/:conversationId/context')
  async context(@CurrentUser() user: User, @Param('conversationId') id: string, @Body() body: unknown) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const input = parseInput(z.object({ item_id: z.number().int().positive().nullable() }).strict(), body);
    const conversation = await this.conversations.assertBuyer(id, user.id);
    const itemId = await this.viewedItem(conversation.shopId, input.item_id);
    try {
      this.voice.runtime.setViewedItem(id, user.id, itemId);
    } catch {
      throw notFound('Voice session');
    }
    return { data: { item_id: itemId } };
  }
  @Get('voice/sessions/:conversationId/poll')
  async poll(@CurrentUser() user: User, @Param('conversationId') id: string, @Query() query: unknown, @Res() res: Response) {
    if (!this.enabled()) return res.status(503).json({ error: { code: 'assistant_unavailable', message: 'Assistant is unavailable' } });
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const { after } = parseInput(z.object({ after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) }), query);
    await this.conversations.assertBuyer(id, user.id);
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ data: this.voice.runtime.poll(id, user.id, after) });
    } catch {
      throw notFound('Voice session');
    }
  }
  @Get('voice/sessions/:conversationId/events')
  async events(@CurrentUser() user: User, @Param('conversationId') id: string, @Res() res: Response) {
    if (!this.enabled())
      return res
        .status(503)
        .json({ error: { code: 'assistant_unavailable', message: 'Voice assistant is unavailable' } });
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    await this.conversations.assertBuyer(id, user.id);
    const buffered: Record<string, unknown>[] = [];
    let ready = false;
    let unsubscribe: () => void;
    try {
      unsubscribe = this.voice.runtime.subscribe(id, user.id, (event) => {
        if (!ready) buffered.push(event);
        else if (!res.destroyed) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'closed') res.end();
        }
      });
    } catch {
      throw notFound('Voice session');
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    ready = true;
    for (const event of buffered) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'closed') res.end();
    }
    res.on('close', unsubscribe);
  }
  @Post('voice/sessions/:conversationId/text')
  async text(
    @CurrentUser() user: User,
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    if (!this.enabled())
      return res
        .status(503)
        .json({ error: { code: 'assistant_unavailable', message: 'Voice assistant is unavailable' } });
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    const input = parseInput(textSchema, body);
    await this.conversations.assertBuyer(id, user.id);
    try {
      await this.voice.runtime.text(id, user.id, input.text);
    } catch {
      throw validation('Voice session unavailable');
    }
    return res.json({ data: { ok: true } });
  }
  @Post('voice/sessions/:conversationId/stop')
  async stop(@CurrentUser() user: User, @Param('conversationId') id: string, @Res() res: Response) {
    if (!this.enabled())
      return res
        .status(503)
        .json({ error: { code: 'assistant_unavailable', message: 'Voice assistant is unavailable' } });
    if (!z.string().uuid().safeParse(id).success) throw notFound('Conversation');
    await this.conversations.assertBuyer(id, user.id);
    try {
      await this.voice.runtime.stop(id, user.id);
    } catch {
      throw notFound('Voice session');
    }
    return res.json({ data: { ok: true } });
  }
}
