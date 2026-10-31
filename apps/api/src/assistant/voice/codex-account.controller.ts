import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { RequireRole, SessionGuard } from '../../auth/session.guard';
import { CodexAccountService } from './codex-account.service';

/** Seller maintenance only. Device-code sign-in belongs exclusively to public Codex setup. */
@Controller('api/v1/seller/assistant/connection')
@UseGuards(SessionGuard)
@RequireRole('SELLER')
export class CodexAccountController {
  constructor(private readonly account: CodexAccountService) {}
  @Get()
  async status() {
    return { data: { ...(await this.account.status()), login: null } };
  }
  @Delete()
  async disconnect() {
    return { data: { ...(await this.account.disconnect()), login: null } };
  }
}
