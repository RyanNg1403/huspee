import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, RequireRole, SessionGuard } from '../auth/session.guard';
import { parseInput } from '../common/validation';
import { validation } from '../common/errors';
import { ReturnEvidenceService, presentEvidence } from '../domain/return-evidence.service';

@Controller('api/v1')
@UseGuards(SessionGuard)
export class ReturnEvidenceController {
  constructor(private readonly evidence: ReturnEvidenceService) {}
  @RequireRole('BUYER')
  @Post('buyer/orders/:orderSn/return-evidence')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(@CurrentUser() user: User, @Param('orderSn') orderSn: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw validation('Choose one JPEG, PNG or WebP photo');
    return { data: presentEvidence(await this.evidence.upload(user.id, orderSn, file.buffer)) };
  }
  @RequireRole('BUYER')
  @Get('buyer/orders/:orderSn/return-evidence')
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: User, @Param('orderSn') orderSn: string) { return { data: (await this.evidence.list(user.id, orderSn)).map(presentEvidence) }; }
  @RequireRole('BUYER')
  @Delete('buyer/return-evidence/:id')
  async remove(@CurrentUser() user: User, @Param('id') id: string) { await this.evidence.remove(user.id, parseInput(z.string().uuid(), id)); return { data: { deleted: true } }; }
  @RequireRole('BUYER')
  @Get('buyer/return-evidence/:id/content')
  async buyerContent(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) { this.image(res, await this.evidence.buyerContent(user.id, parseInput(z.string().uuid(), id))); }
  @RequireRole('BUYER')
  @Get('assistant/conversations/:id/return-evidence')
  @Header('Cache-Control', 'private, no-store')
  async selection(@CurrentUser() user: User, @Param('id') id: string) { return { data: await this.evidence.selection(user.id, parseInput(z.string().uuid(), id)) }; }
  @RequireRole('BUYER')
  @Put('assistant/conversations/:id/return-evidence')
  async select(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(z.object({ order_sn: z.string().min(1), evidence_ids: z.array(z.string().uuid()).max(8) }).strict(), body);
    return { data: await this.evidence.setSelection(user.id, parseInput(z.string().uuid(), id), input.order_sn, input.evidence_ids) };
  }
  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/returns/:returnSn/evidence')
  @Header('Cache-Control', 'private, no-store')
  async sellerList(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('returnSn') returnSn: string) { return { data: (await this.evidence.sellerList(user.id, shopId, returnSn)).map(presentEvidence) }; }
  @RequireRole('SELLER')
  @Get('seller/shops/:shopId/returns/:returnSn/evidence/:id/content')
  async sellerContent(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Param('returnSn') returnSn: string, @Param('id') id: string, @Res() res: Response) { this.image(res, await this.evidence.sellerContent(user.id, shopId, returnSn, parseInput(z.string().uuid(), id))); }
  private image(res: Response, data: Buffer) {
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.send(data);
  }
}
