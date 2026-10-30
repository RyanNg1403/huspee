import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async start(input: { shopId: number; buyerId: number; channel: 'VOICE' | 'TEXT'; language?: string }): Promise<{ id: string }> {
    return this.prisma.conversation.create({ data: input, select: { id: true } });
  }

  async appendMessage(conversationId: string, role: 'USER' | 'ASSISTANT', text: string): Promise<void> {
    await this.prisma.conversationMessage.create({ data: { conversationId, role, text } });
  }

  async end(conversationId: string): Promise<void> {
    await this.prisma.conversation.updateMany({ where: { id: conversationId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
  }

  async assertBuyer(conversationId: string, buyerId: number): Promise<{ shopId: number }> {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, buyerId }, select: { shopId: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
