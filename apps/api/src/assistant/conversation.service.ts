import { Injectable, NotFoundException } from '@nestjs/common';
import { SummaryService } from './insights/summary.service';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService, private readonly summaries: SummaryService) {}

  async start(input: { shopId: number; buyerId: number; channel: 'VOICE' | 'TEXT'; language?: string }): Promise<{ id: string }> {
    return this.prisma.conversation.create({ data: input, select: { id: true } });
  }

  async appendMessage(conversationId: string, role: 'USER' | 'ASSISTANT', text: string): Promise<void> {
    await this.prisma.conversationMessage.create({ data: { conversationId, role, text } });
  }

  /** Seller-visible record of speech the backend blocked or corrected (never shown to buyers). */
  async logSpeechCheck(conversationId: string, log: { kind: string; text: string; unsupported: string[]; spoken: string }): Promise<void> {
    await this.prisma.conversationToolCall.create({
      data: { conversationId, tool: 'speech_check', args: { kind: log.kind }, result: { text: JSON.stringify(log) }, success: true, latencyMs: 0 },
    });
  }

  async end(conversationId: string): Promise<void> {
    const result = await this.prisma.conversation.updateMany({ where: { id: conversationId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
    if (result.count) this.summaries.schedule(conversationId);
  }

  async assertBuyer(conversationId: string, buyerId: number): Promise<{ shopId: number }> {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, buyerId }, select: { shopId: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
