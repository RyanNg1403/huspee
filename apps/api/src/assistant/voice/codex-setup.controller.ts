import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, SessionGuard } from '../../auth/session.guard';
import { randomToken, sha256Hex } from '../../common/crypto';
import { loadConfig } from '../../config';
import { CodexAccountService } from './codex-account.service';

const SETUP_COOKIE = 'huspee_codex_setup';
const SETUP_PATH = '/api/v1/assistant/connection';

/** Device-code setup without a marketplace login; account logout remains seller-only. */
@Controller('api/v1/assistant/connection')
@UseGuards(SessionGuard)
@Public()
export class CodexSetupController {
  constructor(private readonly account: CodexAccountService) {}

  private token(req: Request): string | undefined {
    const value: unknown = req.cookies?.[SETUP_COOKIE];
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  }

  @Get()
  async status(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const token = this.token(req);
    return { data: await this.account.setupStatus(token ? sha256Hex(token) : undefined) };
  }

  @Post('login')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.token(req) ?? randomToken();
    const owner = sha256Hex(token);
    res.setHeader('Cache-Control', 'no-store');
    await this.account.start(owner);
    res.cookie(SETUP_COOKIE, token, {
      httpOnly: true,
      secure: loadConfig().COOKIE_SECURE,
      sameSite: 'strict',
      path: SETUP_PATH,
      maxAge: 15 * 60 * 1000,
    });
    return { data: await this.account.setupStatus(owner) };
  }

  @Post('login/cancel')
  async cancel(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const token = this.token(req);
    const status = await this.account.setupCancel(token ? sha256Hex(token) : undefined);
    res.clearCookie(SETUP_COOKIE, { path: SETUP_PATH });
    return { data: status };
  }
}
