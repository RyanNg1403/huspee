import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { RequireRole, SessionGuard } from '../../auth/session.guard';
import { CodexAccountService } from './codex-account.service';

/** The assistant's Codex connection is shared by every shop, so any signed-in seller can manage it. */
@Controller('api/v1/seller/assistant/connection')
@UseGuards(SessionGuard)
@RequireRole('SELLER')
export class CodexAccountController {
  constructor(private readonly account: CodexAccountService) {}
  @Get()
  async status() {
    return { data: await this.account.status() };
  }
  @Post('login')
  async login() {
    return { data: await this.account.start() };
  }
  @Post('login/cancel')
  async cancel() {
    return { data: await this.account.cancel() };
  }
  @Delete()
  async disconnect() {
    return { data: await this.account.disconnect() };
  }
}
