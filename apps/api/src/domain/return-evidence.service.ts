import { transactionConflict } from '../common/transaction-conflict';
import { Injectable } from '@nestjs/common';
import { Prisma, PendingAction } from '@prisma/client';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService, Tx } from '../common/prisma.service';
import { notFound, validation, invalidState } from '../common/errors';
import { AssistantEvents } from '../assistant/assistant.events';
import type { PendingActionView } from '../assistant/types';

export const evidenceMetadata = { id: true, buyerId: true, orderSn: true, returnSn: true, sha256: true, byteSize: true, createdAt: true } satisfies Prisma.ReturnEvidenceSelect;
type Evidence = Prisma.ReturnEvidenceGetPayload<{ select: typeof evidenceMetadata }>;
export const presentEvidence = (row: Evidence) => ({ evidence_id: row.id, size: row.byteSize, create_time: Math.floor(row.createdAt.getTime() / 1000), return_sn: row.returnSn });
export async function validateDraftEvidence(db: Tx, buyerId: number, orderSn: string, ids: string[]) {
  if (ids.length > 8 || new Set(ids).size !== ids.length) throw validation('Select up to eight distinct evidence photos');
  const rows = await db.returnEvidence.findMany({ where: { id: { in: ids }, buyerId, orderSn, returnSn: null }, select: evidenceMetadata, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (rows.length !== ids.length) throw invalidState('Selected evidence is unavailable or already submitted; select photos again');
  return rows;
}

@Injectable()
export class ReturnEvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly events: AssistantEvents) {}

  async assertOrder(buyerId: number, orderSn: string, db: Tx = this.prisma) {
    const order = await db.order.findFirst({ where: { orderSn, buyerId }, select: { orderSn: true, shopId: true } });
    if (!order) throw notFound('Order');
    return order;
  }
  async validate(buyerId: number, orderSn: string, ids: string[], db: Tx = this.prisma) {
    return validateDraftEvidence(db, buyerId, orderSn, ids);
  }
  async list(buyerId: number, orderSn: string) {
    await this.assertOrder(buyerId, orderSn);
    return this.prisma.returnEvidence.findMany({ where: { buyerId, orderSn, returnSn: null }, select: evidenceMetadata, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
  async upload(buyerId: number, orderSn: string, bytes: Buffer) {
    await this.assertOrder(buyerId, orderSn);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw validation('Upload one JPEG, PNG or WebP photo up to 5 MB');
    let normalized: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 50_000_000, animated: false, pages: 1 });
      const meta = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new Error('Unsupported format');
      normalized = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch { throw validation('Invalid image. Use JPEG, PNG or WebP (HEIC and SVG are not supported)'); }
    if (normalized.length > 2 * 1024 * 1024) throw validation('Photo is too large after processing; use a smaller image');
    return this.prisma.$transaction(async (tx) => {
      await tx.returnEvidence.deleteMany({ where: { buyerId, returnSn: null, createdAt: { lt: new Date(Date.now() - 86400000) } } });
      if (await tx.returnEvidence.count({ where: { buyerId, orderSn, returnSn: null } }) >= 16) throw validation('Remove unused draft photos before uploading more');
      return tx.returnEvidence.create({ data: { buyerId, orderSn, data: new Uint8Array(normalized), byteSize: normalized.length, sha256: createHash('sha256').update(normalized).digest('hex') }, select: evidenceMetadata });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(transactionConflict);
  }
  private async cancelPending(db: Tx, buyerId: number, conversationId?: string, evidenceId?: string) {
    const rows = await db.pendingAction.findMany({ where: { buyerId, type: 'OPEN_RETURN', status: 'PENDING', ...(conversationId ? { conversationId } : {}), ...(evidenceId ? { payload: { path: ['input', 'evidence_ids'], array_contains: [evidenceId] } } : {}) } });
    const cancelled: PendingAction[] = [];
    for (const row of rows) {
      const changed = await db.pendingAction.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (changed.count) cancelled.push({ ...row, status: 'CANCELLED' });
    }
    return cancelled;
  }
  private emitCancelled(rows: PendingAction[]) {
    for (const row of rows) this.events.emitAction({ conversationId: row.conversationId, initiatedBy: 'buyer', action: {
      action_id: row.id, type: row.type, status: 'CANCELLED', requires_tap: row.requiresTap, expires_at: Math.floor(row.expiresAt.getTime() / 1000), summary: row.summary as unknown as PendingActionView['summary'],
    } });
  }
  async remove(buyerId: number, id: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const row = await tx.returnEvidence.findFirst({ where: { id, buyerId, returnSn: null }, select: evidenceMetadata });
      if (!row) throw notFound('Draft evidence');
      const deleted = await tx.returnEvidence.deleteMany({ where: { id, buyerId, returnSn: null } });
      if (!deleted.count) throw invalidState('Evidence was submitted; it cannot be deleted');
      const selections = await tx.returnEvidenceSelection.findMany({ where: { evidenceIds: { has: id }, conversation: { buyerId } } });
      for (const selection of selections) await tx.returnEvidenceSelection.update({ where: { conversationId: selection.conversationId }, data: { evidenceIds: selection.evidenceIds.filter((entry) => entry !== id) } });
      return this.cancelPending(tx, buyerId, undefined, id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(transactionConflict);
    this.emitCancelled(cancelled);
  }
  async conversation(buyerId: number, conversationId: string, db: Tx = this.prisma) {
    const row = await db.conversation.findFirst({ where: { id: conversationId, buyerId, status: 'ACTIVE' }, select: { shopId: true } });
    if (!row) throw notFound('Conversation');
    return row;
  }
  async selection(buyerId: number, conversationId: string, db: Tx = this.prisma) {
    await this.conversation(buyerId, conversationId, db);
    const row = await db.returnEvidenceSelection.findUnique({ where: { conversationId } });
    if (!row) return { order_sn: null, evidence_ids: [] as string[], evidence: [] as ReturnType<typeof presentEvidence>[] };
    const photos = await db.returnEvidence.findMany({ where: { id: { in: row.evidenceIds }, buyerId, orderSn: row.orderSn, returnSn: null }, select: evidenceMetadata });
    return { order_sn: row.orderSn, evidence_ids: row.evidenceIds, evidence: row.evidenceIds.flatMap((id) => { const photo = photos.find((entry) => entry.id === id); return photo ? [presentEvidence(photo)] : []; }) };
  }
  async setSelection(buyerId: number, conversationId: string, orderSn: string, ids: string[]) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const context = await this.conversation(buyerId, conversationId, tx);
      const order = await this.assertOrder(buyerId, orderSn, tx);
      if (context.shopId !== order.shopId) throw notFound('Order');
      await this.validate(buyerId, orderSn, ids, tx);
      const previous = await tx.returnEvidenceSelection.findUnique({ where: { conversationId } });
      if (previous?.orderSn === orderSn && previous.evidenceIds.length === ids.length && previous.evidenceIds.every((id) => ids.includes(id))) return [];
      await tx.returnEvidenceSelection.upsert({ where: { conversationId }, create: { conversationId, orderSn, evidenceIds: ids }, update: { orderSn, evidenceIds: ids } });
      return this.cancelPending(tx, buyerId, conversationId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(transactionConflict);
    this.emitCancelled(cancelled);
    return this.selection(buyerId, conversationId);
  }
  async buyerContent(buyerId: number, id: string) {
    const row = await this.prisma.returnEvidence.findFirst({ where: { id, buyerId }, select: { data: true } });
    if (!row) throw notFound('Evidence');
    return Buffer.from(row.data);
  }
  async assertSeller(userId: number, shopId: number, returnSn: string) {
    if (!await this.prisma.shopMember.findFirst({ where: { userId, shopId } })) throw notFound('Return');
    if (!await this.prisma.returnRequest.findFirst({ where: { returnSn, shopId } })) throw notFound('Return');
  }
  async sellerList(userId: number, shopId: number, returnSn: string) {
    await this.assertSeller(userId, shopId, returnSn);
    return this.prisma.returnEvidence.findMany({ where: { returnSn }, select: evidenceMetadata, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }
  async sellerContent(userId: number, shopId: number, returnSn: string, id: string) {
    await this.assertSeller(userId, shopId, returnSn);
    const row = await this.prisma.returnEvidence.findFirst({ where: { id, returnSn }, select: { data: true } });
    if (!row) throw notFound('Evidence');
    return Buffer.from(row.data);
  }
}
