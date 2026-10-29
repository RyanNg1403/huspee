import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { CompatRegistry } from '../compat/compat.registry';

/** Health, public media and the machine-readable list of served compat operations. */
@Controller()
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CompatRegistry,
  ) {}

  @Get('healthz')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  @Get('media/:imageId')
  async media(@Param('imageId') imageId: string, @Res() res: Response) {
    const image = await this.prisma.mediaImage.findUnique({ where: { imageId } });
    if (!image) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (image.mimeType === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(Buffer.from(image.data));
  }

  @Get('api/v1/meta/compat-operations')
  operations() {
    return {
      data: this.registry.list().map((o) => ({
        path: `/api/v2${o.path}`,
        method: o.method,
        auth: o.auth,
        provenance: o.provenance ?? 'shopee-compatible',
      })),
    };
  }
}
