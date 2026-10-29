import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { randomHex } from '../../common/crypto';
import { validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { unix } from '../../common/time';
import { q } from '../../common/validation';
import { mediaPath, mediaUrl } from '../../domain/catalog.service';
import { ALL_PUSH_CODES } from '../../domain/push.service';
import { CompatContext, CompatOperationProvider, op } from '../compat.types';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** media_space.upload_image (+ media.upload_image alias) and push.* configuration. */
@Injectable()
export class MediaPushOps implements CompatOperationProvider {
  constructor(private readonly prisma: PrismaService) {}

  operations() {
    return [
      op({
        path: '/media_space/upload_image',
        method: 'POST',
        auth: 'shop',
        input: z.object({ scene: z.enum(['normal', 'desc']).default('normal'), ratio: z.string().optional() }),
        handler: async (ctx, input) => {
          const files = this.imageFiles(ctx, 'image');
          const infos = [];
          for (const file of files) infos.push(await this.store(ctx.shopId, file, input.scene));
          const toInfo = (id: string) => ({ image_id: id, image_url_list: [{ image_url_region: 'VN', image_url: mediaUrl(mediaPath(id)) }] });
          return { image_info: toInfo(infos[0]!), image_info_list: infos.map((id, idx) => ({ id: idx, image_info: toInfo(id) })) };
        },
      }),
      op({
        path: '/media/upload_image',
        method: 'POST',
        auth: 'shop',
        input: z.object({ business: q.int().optional(), scene: q.int().optional() }),
        handler: async (ctx) => {
          const files = this.imageFiles(ctx, 'images');
          const ids = [];
          for (const file of files) ids.push(await this.store(ctx.shopId, file, 'normal'));
          return { image_list: ids.map((id) => ({ image_id: id, image_url: mediaUrl(mediaPath(id)) })) };
        },
      }),

      // ----- push configuration -----
      op({
        path: '/push/get_app_push_config',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async (ctx) => {
          const cfg = await this.prisma.pushConfig.findUnique({ where: { partnerId: ctx.partnerId } });
          const on = cfg?.pushCodes ?? [];
          return {
            callback_url: cfg?.callbackUrl ?? '',
            live_push_status: cfg?.callbackUrl ? 'Normal' : 'Unset',
            blocked_shop_id: cfg?.blockedShopIds ?? [],
            push_config_on_list: on,
            push_config_off_list: ALL_PUSH_CODES.filter((c) => !on.includes(c)),
          };
        },
      }),
      op({
        path: '/push/set_app_push_config',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          callback_url: z.string().url().or(z.literal('')).optional(),
          set_push_config_on: z.array(q.int()).optional(),
          set_push_config_off: z.array(q.int()).optional(),
          blocked_shop_id_list: z.array(q.int()).optional(),
        }),
        handler: async (ctx, input) => {
          const unknown = [...(input.set_push_config_on ?? []), ...(input.set_push_config_off ?? [])].filter(
            (c) => !(ALL_PUSH_CODES as number[]).includes(c),
          );
          if (unknown.length) throw validation(`Unsupported push code(s): ${unknown.join(', ')}`);
          const current = await this.prisma.pushConfig.findUnique({ where: { partnerId: ctx.partnerId } });
          const codes = new Set(current?.pushCodes ?? []);
          input.set_push_config_on?.forEach((c) => codes.add(c));
          input.set_push_config_off?.forEach((c) => codes.delete(c));
          const data = {
            callbackUrl: input.callback_url ?? current?.callbackUrl ?? '',
            pushCodes: [...codes].sort((a, b) => a - b),
            blockedShopIds: input.blocked_shop_id_list ?? current?.blockedShopIds ?? [],
          };
          await this.prisma.pushConfig.upsert({ where: { partnerId: ctx.partnerId }, create: { partnerId: ctx.partnerId, ...data }, update: data });
          return { result: 'success' };
        },
      }),
      op({
        path: '/push/get_lost_push_message',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async (ctx) => {
          const rows = await this.prisma.pushEvent.findMany({
            where: { partnerId: ctx.partnerId, status: 'FAILED' },
            orderBy: { id: 'asc' },
            take: 101,
          });
          const page = rows.slice(0, 100);
          return {
            push_message_list: page.map((r) => ({
              shop_id: r.shopId,
              code: r.code,
              timestamp: unix(r.createdAt),
              data: JSON.stringify((r.payload as { data?: unknown }).data ?? {}),
            })),
            has_next_page: rows.length > 100,
            last_message_id: page.at(-1)?.id ?? 0,
          };
        },
      }),
      op({
        path: '/push/confirm_consumed_lost_push_message',
        method: 'POST',
        auth: 'shop',
        input: z.object({ last_message_id: q.int() }),
        handler: async (ctx, input) => {
          await this.prisma.pushEvent.updateMany({
            where: { partnerId: ctx.partnerId, status: 'FAILED', id: { lte: input.last_message_id } },
            data: { status: 'SKIPPED' },
          });
          return {};
        },
      }),
    ];
  }

  private imageFiles(ctx: CompatContext, field: string) {
    const files = (ctx.files ?? []).filter((f) => f.fieldname === field || f.fieldname === `${field}[]`);
    if (files.length === 0) throw validation(`Missing multipart file field "${field}"`);
    for (const f of files) {
      if (!ALLOWED_MIME.has(sniffMime(f.buffer) ?? f.mimetype)) throw validation('Only PNG, JPEG, GIF or WEBP images are accepted');
    }
    return files;
  }

  private async store(shopId: number, file: { buffer: Buffer; mimetype: string }, scene: string): Promise<string> {
    const imageId = `vn-11134207-${randomHex(12)}`;
    await this.prisma.mediaImage.create({
      data: { imageId, shopId, mimeType: sniffMime(file.buffer) ?? file.mimetype, data: new Uint8Array(file.buffer), scene },
    });
    return imageId;
  }
}

function sniffMime(buf: Buffer): string | undefined {
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}
