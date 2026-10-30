import { defaultAssistantConfig } from './assistant-defaults';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { AssistantToolRegistry } from './tools/assistant-tool.registry';
import { VoiceCatalogRegistry } from './voice-catalog';
import { ActionsService } from './actions.service';
import { CurrentUser, Public, RequireRole, SessionGuard } from '../auth/session.guard';
import { forbidden, notFound, validation } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { unix } from '../common/time';
import { paging, parseInput, q } from '../common/validation';
import { pageInfo } from '../buyer/marketplace.controller';

const configSchema = z
  .object({
    enabled: z.boolean().optional(),
    tone: z.enum(['FRIENDLY', 'PROFESSIONAL', 'ENTHUSIASTIC']).optional(),
    voice: z.string().min(1).max(100).optional(),
    greeting_vi: z.string().max(1000).optional(),
    greeting_en: z.string().max(1000).optional(),
  })
  .strict();
const faqSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    answer: z.string().trim().min(1).max(4000),
    lang: z.enum(['vi', 'en', 'any']),
    enabled: z.boolean(),
  })
  .strict();

@Controller('api/v1')
@UseGuards(SessionGuard)
export class AssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: ActionsService,
    private readonly tools: AssistantToolRegistry,
    private readonly voiceCatalog: VoiceCatalogRegistry,
  ) {}

  @Public()
  @Get('assistant/shops/:shopId/profile')
  async profile(@Param('shopId', ParseIntPipe) shopId: number) {
    const shop = await this.prisma.shop.findFirst({ where: { id: shopId, status: 'NORMAL' }, include: { assistantConfig: true } });
    if (!shop) throw notFound('Shop');
    const config = shop.assistantConfig ?? defaultAssistantConfig(shop.name);
    return {
      data: {
        shop_id: shop.id,
        shop_name: shop.name,
        enabled: config?.enabled ?? true,
        voice: config.voice,
        greeting: {
          vi: config.greetingVi,
          en: config.greetingEn,
        },
      },
    };
  }

  @RequireRole('BUYER')
  @Post('assistant/_debug/tools/:name')
  async debugTool(@CurrentUser() user: User, @Param('name') name: string, @Body() body: unknown) {
    if (process.env.ASSISTANT_TOOL_DEBUG !== 'true') throw notFound('Route');
    const input = parseInput(z.object({ conversation_id: z.string().uuid(), args: z.unknown() }).strict(), body);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversation_id, buyerId: user.id, status: 'ACTIVE' },
      select: { shopId: true },
    });
    if (!conversation) throw notFound('Conversation');
    return { data: await this.tools.run(name, input.args, { conversationId: input.conversation_id, buyerId: user.id, shopId: conversation.shopId }) };
  }

  @RequireRole('BUYER')
  @Get('assistant/actions/:actionId/options')
  async actionOptions(@CurrentUser() user: User, @Param('actionId') actionId: string) {
    return { data: await this.actions.editOptions(actionId, user.id) };
  }

  @RequireRole('BUYER')
  @Patch('assistant/actions/:actionId')
  async editAction(@CurrentUser() user: User, @Param('actionId') actionId: string, @Body() body: unknown) {
    const input = parseInput(z.object({ quantity: z.number().int().min(1).max(999), model_id: z.number().int().nonnegative(), line_index: z.number().int().nonnegative().optional() }).strict(), body);
    return { data: { action: await this.actions.edit(actionId, user.id, input) } };
  }

  @RequireRole('BUYER')
  @Post('assistant/actions/:actionId/confirm')
  async confirm(@CurrentUser() user: User, @Param('actionId') actionId: string, @Body() body: unknown) {
    const input = parseInput(
      z
        .object({
          idempotency_key: z
            .string()
            .min(8)
            .max(128)
            .regex(/^[A-Za-z0-9_\-:.]+$/),
        })
        .strict(),
      body,
    );
    return { data: { action: await this.actions.confirm(actionId, user.id, undefined, true, input.idempotency_key) } };
  }

  @RequireRole('BUYER')
  @Post('assistant/actions/:actionId/cancel')
  async cancel(@CurrentUser() user: User, @Param('actionId') actionId: string) {
    return { data: { action: await this.actions.cancel(actionId, user.id) } };
  }

  private async member(user: User, shopId: number) {
    if (!(await this.prisma.shopMember.findUnique({ where: { userId_shopId: { userId: user.id, shopId } } }))) throw forbidden();
  }

  private presentConfig(config: {
    shopId: number;
    enabled: boolean;
    tone: string;
    voice: string;
    greetingVi: string;
    greetingEn: string;
    updatedAt: Date;
  }) {
    return {
      shop_id: config.shopId,
      enabled: config.enabled,
      tone: config.tone,
      voice: config.voice,
      greeting_vi: config.greetingVi,
      greeting_en: config.greetingEn,
      updated_at: unix(config.updatedAt),
    };
  }

  private presentFaq(faq: {
    id: number;
    shopId: number;
    question: string;
    answer: string;
    lang: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: faq.id,
      shop_id: faq.shopId,
      question: faq.question,
      answer: faq.answer,
      lang: faq.lang,
      enabled: faq.enabled,
      created_at: unix(faq.createdAt),
      updated_at: unix(faq.updatedAt),
    };
  }

  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/assistant/config')
  async getConfig(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.member(user, shopId);
    const config = await this.prisma.assistantConfig.findUnique({ where: { shopId } });
    if (config) return { data: this.presentConfig(config) };
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const defaults = defaultAssistantConfig(shop.name);
    return {
      data: {
        shop_id: shopId,
        enabled: defaults.enabled,
        tone: defaults.tone,
        voice: defaults.voice,
        greeting_vi: defaults.greetingVi,
        greeting_en: defaults.greetingEn,
        updated_at: unix(shop.updatedAt),
      },
    };
  }

  @RequireRole('SELLER')
  @Put('seller/shops/:shopId/assistant/config')
  async updateConfig(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Body() body: unknown) {
    await this.member(user, shopId);
    const input = parseInput(configSchema, body);
    if (input.voice && !(await this.voiceCatalog.list()).includes(input.voice)) throw validation('Unsupported voice');
    const data = { enabled: input.enabled, tone: input.tone, voice: input.voice, greetingVi: input.greeting_vi, greetingEn: input.greeting_en };
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const config = await this.prisma.assistantConfig.upsert({
      where: { shopId },
      update: data,
      create: {
        shopId,
        greetingVi: input.greeting_vi ?? defaultAssistantConfig(shop.name).greetingVi,
        greetingEn: input.greeting_en ?? defaultAssistantConfig(shop.name).greetingEn,
        enabled: input.enabled ?? defaultAssistantConfig(shop.name).enabled,
        tone: input.tone ?? defaultAssistantConfig(shop.name).tone,
        voice: input.voice ?? defaultAssistantConfig(shop.name).voice,
      },
    });
    return { data: this.presentConfig(config) };
  }

  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/assistant/faqs')
  async faqs(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.member(user, shopId);
    const rows = await this.prisma.assistantFaq.findMany({ where: { shopId }, orderBy: { id: 'asc' } });
    return { data: rows.map((row) => this.presentFaq(row)) };
  }

  @RequireRole('SELLER')
  @Post('seller/shops/:shopId/assistant/faqs')
  async createFaq(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Body() body: unknown) {
    await this.member(user, shopId);
    const input = parseInput(faqSchema, body);
    return { data: this.presentFaq(await this.prisma.assistantFaq.create({ data: { shopId, ...input } })) };
  }

  @RequireRole('SELLER')
  @Put('seller/shops/:shopId/assistant/faqs/:faqId')
  async updateFaq(
    @CurrentUser() user: User,
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('faqId', ParseIntPipe) faqId: number,
    @Body() body: unknown,
  ) {
    await this.member(user, shopId);
    const input = parseInput(faqSchema.partial(), body);
    const updated = await this.prisma.assistantFaq.updateMany({ where: { id: faqId, shopId }, data: input });
    if (!updated.count) throw notFound('FAQ');
    return { data: this.presentFaq(await this.prisma.assistantFaq.findUniqueOrThrow({ where: { id: faqId } })) };
  }

  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/assistant/conversations')
  async conversations(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Query() query: unknown) {
    await this.member(user, shopId);
    const input = parseInput(
      z.object({
        ...paging,
        status: z.enum(['ACTIVE', 'ENDED']).optional(),
        has_handoff: q.bool().optional(),
        from: q.int().optional(),
        to: q.int().optional(),
      }),
      query,
    );
    const where = {
      shopId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.has_handoff === undefined ? {} : { tickets: input.has_handoff ? { some: {} } : { none: {} } }),
      ...(input.from !== undefined || input.to !== undefined
        ? {
            startedAt: {
              ...(input.from !== undefined ? { gte: new Date(input.from * 1000) } : {}),
              ...(input.to !== undefined ? { lte: new Date(input.to * 1000) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { data: rows.map((row) => this.presentConversation(row)), page: pageInfo(input.page, input.page_size, total) };
  }

  private presentConversation(row: {
    id: string;
    shopId: number;
    buyerId: number;
    channel: string;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    language: string | null;
    summary: unknown;
  }) {
    return {
      conversation_id: row.id,
      shop_id: row.shopId,
      buyer_id: row.buyerId,
      channel: row.channel,
      status: row.status,
      started_at: unix(row.startedAt),
      ended_at: row.endedAt ? unix(row.endedAt) : null,
      language: row.language,
      summary: row.summary,
    };
  }

  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/assistant/conversations/:conversationId')
  async conversation(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('conversationId') id: string) {
    await this.member(user, shopId);
    const row = await this.prisma.conversation.findFirst({
      where: { id, shopId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, toolCalls: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw notFound('Conversation');
    return {
      data: {
        ...this.presentConversation(row),
        messages: row.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, created_at: unix(m.createdAt) })),
        tool_calls: row.toolCalls.map((t) => ({
          id: t.id,
          tool: t.tool,
          args: t.args,
          result: t.result,
          success: t.success,
          error: t.error,
          latency_ms: t.latencyMs,
          created_at: unix(t.createdAt),
        })),
      },
    };
  }

  @RequireRole('SELLER')
  @Delete('seller/shops/:shopId/assistant/faqs/:faqId')
  async removeFaq(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('faqId', ParseIntPipe) faqId: number) {
    await this.member(user, shopId);
    const removed = await this.prisma.assistantFaq.deleteMany({ where: { id: faqId, shopId } });
    if (!removed.count) throw notFound('FAQ');
    return { data: { deleted: true } };
  }
}
