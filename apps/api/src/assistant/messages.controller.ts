import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { HandoffTicket, Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, RequireRole, SessionGuard } from '../auth/session.guard';
import { forbidden, notFound, invalidState } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { unix } from '../common/time';
import { paging, parseInput } from '../common/validation';
import { pageInfo } from '../buyer/marketplace.controller';

const replySchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
const listSchema = z.object({ ...paging, status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(), q: z.string().trim().max(200).optional() });
const include = {
  shop: { select: { name: true, logoUrl: true } },
  buyer: { select: { name: true } },
  messages: { orderBy: { createdAt: 'asc' as const } },
};
type Ticket = Prisma.HandoffTicketGetPayload<{ include: typeof include }>;

@Controller('api/v1')
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}
  private presentMessage(m: Ticket['messages'][number]) {
    return { id: m.id, ticket_id: m.ticketId, author: m.author, author_user_id: m.authorUserId, body: m.body, created_at: unix(m.createdAt) };
  }
  private present(t: Ticket) {
    return {
      ticket_id: t.id,
      shop_id: t.shopId,
      shop_name: t.shop.name,
      logo_url: t.shop.logoUrl,
      buyer_name: t.buyer.name,
      subject: t.subject,
      status: t.status,
      buyer_unread: t.buyerUnread,
      seller_unread: t.sellerUnread,
      conversation_id: t.conversationId,
      updated_at: unix(t.updatedAt),
      last_message: t.messages.length ? this.presentMessage(t.messages[t.messages.length - 1]!) : null,
    };
  }
  private async seller(user: User, shopId: number) {
    if (!(await this.prisma.shopMember.findUnique({ where: { userId_shopId: { userId: user.id, shopId } } }))) throw forbidden();
  }
  private async ticket(where: Prisma.HandoffTicketWhereInput) {
    const ticket = await this.prisma.handoffTicket.findFirst({ where, include });
    if (!ticket) throw notFound('Ticket');
    return ticket;
  }
  private async list(where: Prisma.HandoffTicketWhereInput, query: unknown) {
    const input = parseInput(listSchema, query);
    const filtered: Prisma.HandoffTicketWhereInput = {
      ...where,
      ...(input.status ? { status: input.status } : {}),
      // Search the question and the other party's name (buyer for sellers, shop for buyers).
      ...(input.q
        ? {
            OR: [
              { subject: { contains: input.q, mode: 'insensitive' } },
              { buyer: { name: { contains: input.q, mode: 'insensitive' } } },
              { shop: { name: { contains: input.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [tickets, total] = await Promise.all([
      this.prisma.handoffTicket.findMany({
        where: filtered,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.prisma.handoffTicket.count({ where: filtered }),
    ]);
    return { data: tickets.map((t) => this.present(t)), page: pageInfo(input.page, input.page_size, total) };
  }
  private async reply(ticket: HandoffTicket, user: User, body: unknown, author: 'BUYER' | 'SELLER') {
    if (ticket.status === 'CLOSED') throw invalidState('Ticket is closed');
    const input = parseInput(replySchema, body);
    const message = await this.prisma.$transaction(async (tx) => {
      await tx.handoffTicket.update({
        where: { id: ticket.id },
        data:
          author === 'SELLER'
            ? { status: 'ANSWERED', buyerUnread: { increment: 1 }, sellerUnread: 0 }
            : { status: 'OPEN', sellerUnread: { increment: 1 }, buyerUnread: 0 },
      });
      return tx.handoffMessage.create({ data: { ticketId: ticket.id, author, authorUserId: user.id, body: input.body } });
    });
    return { data: this.presentMessage(message) };
  }
  @RequireRole('BUYER')
  @Get('buyer/messages')
  listBuyer(@CurrentUser() user: User, @Query() query: unknown) {
    return this.list({ buyerId: user.id }, query);
  }
  @RequireRole('BUYER')
  @Get('buyer/messages/unread-count')
  async unread(@CurrentUser() user: User) {
    const result = await this.prisma.handoffTicket.aggregate({ where: { buyerId: user.id }, _sum: { buyerUnread: true } });
    return { data: { count: result._sum.buyerUnread ?? 0 } };
  }
  @RequireRole('BUYER')
  @Get('buyer/messages/:ticketId')
  async getBuyer(@CurrentUser() user: User, @Param('ticketId', ParseIntPipe) id: number) {
    const ticket = await this.ticket({ id, buyerId: user.id });
    await this.prisma.handoffTicket.updateMany({
      where: { id, buyerUnread: { gte: ticket.buyerUnread } },
      data: { buyerUnread: { decrement: ticket.buyerUnread } },
    });
    return { data: { ...this.present({ ...ticket, buyerUnread: 0 }), messages: ticket.messages.map((m) => this.presentMessage(m)) } };
  }
  @RequireRole('BUYER')
  @Post('buyer/messages/:ticketId/replies')
  async replyBuyer(@CurrentUser() user: User, @Param('ticketId', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.reply(await this.ticket({ id, buyerId: user.id }), user, body, 'BUYER');
  }
  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/inbox')
  async listSeller(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Query() query: unknown) {
    await this.seller(user, shopId);
    return this.list({ shopId }, query);
  }
  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/inbox/:ticketId')
  async getSeller(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('ticketId', ParseIntPipe) id: number) {
    await this.seller(user, shopId);
    const ticket = await this.ticket({ id, shopId });
    await this.prisma.handoffTicket.updateMany({
      where: { id, sellerUnread: { gte: ticket.sellerUnread } },
      data: { sellerUnread: { decrement: ticket.sellerUnread } },
    });
    return { data: { ...this.present({ ...ticket, sellerUnread: 0 }), messages: ticket.messages.map((m) => this.presentMessage(m)) } };
  }
  @RequireRole('SELLER')
  @Post('seller/shops/:shopId/inbox/:ticketId/replies')
  async replySeller(
    @CurrentUser() user: User,
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('ticketId', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    await this.seller(user, shopId);
    return this.reply(await this.ticket({ id, shopId }), user, body, 'SELLER');
  }
  @RequireRole('SELLER')
  @Post('seller/shops/:shopId/inbox/:ticketId/close')
  async close(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('ticketId', ParseIntPipe) id: number) {
    await this.seller(user, shopId);
    await this.ticket({ id, shopId });
    const ticket = await this.prisma.handoffTicket.update({ where: { id }, data: { status: 'CLOSED' }, include });
    return { data: this.present(ticket) };
  }
}
