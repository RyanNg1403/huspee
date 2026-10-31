import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '@prisma/client';
import { verifyPassword, sha256Hex } from '../common/crypto';
import { DomainError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { SessionService } from '../auth/session.service';
import { sessionCookie, type SessionSurface } from '../auth/session-surface';
import { ShopeeError } from '../compat/compat.types';
import { OAuthService } from './oauth.service';
import { PartnerService } from './partner.service';

/**
 * Browser-facing Shopee-compatible shop authorization:
 *   GET /api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect
 * The signature only proves the Partner; the logged-in seller selects and approves the shop.
 * Consent/login pages are minimal server-rendered HTML owned by the platform.
 */
@Controller('api/v2/shop')
export class AuthPartnerController {
  constructor(
    private readonly partners: PartnerService,
    private readonly oauth: OAuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('auth_partner')
  async authPartner(@Query() query: Record<string, unknown>, @Res() res: Response) {
    try {
      const { app, partnerId } = await this.partners.verify({
        partnerId: query.partner_id,
        timestamp: query.timestamp,
        sign: query.sign,
        path: '/api/v2/shop/auth_partner',
      });
      const redirect = typeof query.redirect === 'string' ? query.redirect : '';
      if (!redirect || !this.partners.isRedirectAllowed(app, redirect)) {
        throw new ShopeeError('error_param', 'redirect is missing or not registered for this partner', 400);
      }
      const request = await this.oauth.createAuthRequest(partnerId, redirect);
      res.redirect(302, `/api/v2/shop/auth_partner/consent?request_id=${encodeURIComponent(request.id)}`);
    } catch (err) {
      if (err instanceof ShopeeError) {
        res.status(err.httpStatus).type('html').send(page('Authorization failed', `<p class="err">${esc(err.error)}: ${esc(err.message)}</p>`));
        return;
      }
      throw err;
    }
  }

  @Get('auth_partner/consent')
  async consent(@Query('request_id') requestId: string, @Req() req: Request, @Res() res: Response) {
    const request = typeof requestId === 'string' ? await this.oauth.getOpenAuthRequest(requestId) : null;
    if (!request) {
      res.status(400).type('html').send(page('Authorization failed', '<p class="err">This authorization link has expired. Please start again.</p>'));
      return;
    }
    const session = await this.sessions.resolvePartner(req);
    const user = session?.user;
    if (!user || !user.roles.includes('SELLER')) {
      res.type('html').send(loginPage(request.id, request.partner.name, user ? 'Please sign in with a seller account.' : undefined));
      return;
    }
    res.type('html').send(await this.consentPage(user, request.id, request.partner.name, request.redirectUri, csrfFor(req, request.id, session!.surface)));
  }

  @Post('auth_partner/login')
  async login(@Body() body: Record<string, string>, @Res() res: Response) {
    const requestId = String(body.request_id ?? '');
    const request = await this.oauth.getOpenAuthRequest(requestId);
    if (!request) {
      res.status(400).type('html').send(page('Authorization failed', '<p class="err">This authorization link has expired.</p>'));
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { email: String(body.email ?? '').trim().toLowerCase() } });
    if (!user || !(await verifyPassword(String(body.password ?? ''), user.passwordHash)) || !user.roles.includes('SELLER')) {
      res.status(401).type('html').send(loginPage(request.id, request.partner.name, 'Invalid seller email or password.'));
      return;
    }
    await this.sessions.create(user.id, res, 'seller');
    res.redirect(303, `/api/v2/shop/auth_partner/consent?request_id=${encodeURIComponent(request.id)}`);
  }

  @Post('auth_partner/approve')
  async approve(@Body() body: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const requestId = String(body.request_id ?? '');
    const session = await this.sessions.resolvePartner(req);
    const user = session?.user;
    if (!user) {
      res.status(401).type('html').send(page('Authorization failed', '<p class="err">Please sign in again.</p>'));
      return;
    }
    if (!body.csrf || body.csrf !== csrfFor(req, requestId, session!.surface)) {
      res.status(403).type('html').send(page('Authorization failed', '<p class="err">Invalid form token.</p>'));
      return;
    }
    if (body.decision === 'deny') {
      const target = await this.oauth.deny(requestId);
      if (target) res.redirect(303, target);
      else res.status(400).type('html').send(page('Authorization failed', '<p class="err">Request already completed.</p>'));
      return;
    }
    try {
      const target = await this.oauth.approve(requestId, user.id, Number(body.shop_id));
      res.redirect(303, target);
    } catch (err) {
      if (err instanceof DomainError) {
        res.status(err.code === 'FORBIDDEN' ? 403 : 400).type('html').send(page('Authorization failed', `<p class="err">${esc(err.message)}</p>`));
        return;
      }
      throw err;
    }
  }

  private async consentPage(user: User, requestId: string, partnerName: string, redirect: string, csrf: string) {
    const shops = await this.prisma.shopMember.findMany({
      where: { userId: user.id, role: 'OWNER', shop: { status: 'NORMAL' } },
      include: { shop: true },
      orderBy: { shopId: 'asc' },
    });
    if (shops.length === 0) {
      return page('No shop to authorize', `<p>${esc(user.name)}, you don't own any active shop yet. Create a shop first.</p>`);
    }
    const options = shops
      .map(
        (m, i) =>
          `<label class="shop"><input type="radio" name="shop_id" value="${m.shop.id}" ${i === 0 ? 'checked' : ''}/> ${esc(m.shop.name)} <small>(shop_id ${m.shop.id})</small></label>`,
      )
      .join('');
    return page(
      'Authorize shop access',
      `<p><b>${esc(partnerName)}</b> is requesting access to manage products, orders, logistics and returns for one of your shops.</p>
       <p class="muted">Signed in as ${esc(user.email)}. You will be redirected to <code>${esc(new URL(redirect).origin)}</code>.</p>
       <form method="post" action="/api/v2/shop/auth_partner/approve">
         <input type="hidden" name="request_id" value="${esc(requestId)}"/>
         <input type="hidden" name="csrf" value="${esc(csrf)}"/>
         ${options}
         <div class="actions">
           <button type="submit" name="decision" value="approve">Authorize</button>
           <button type="submit" name="decision" value="deny" class="secondary">Cancel</button>
         </div>
       </form>`,
    );
  }
}

/** Form token bound to the browser session and the consent request. */
function csrfFor(req: Request, requestId: string, surface: SessionSurface): string {
  const sid = req.cookies?.[sessionCookie(surface)];
  return sha256Hex(`consent:${typeof sid === 'string' ? sid : ''}:${requestId}`);
}

function loginPage(requestId: string, partnerName: string, error?: string) {
  return page(
    'Seller sign in',
    `<p>Sign in to your Huspee seller account to authorize <b>${esc(partnerName)}</b>.</p>
     ${error ? `<p class="err">${esc(error)}</p>` : ''}
     <form method="post" action="/api/v2/shop/auth_partner/login">
       <input type="hidden" name="request_id" value="${esc(requestId)}"/>
       <label>Email <input name="email" type="email" required/></label>
       <label>Password <input name="password" type="password" required/></label>
       <div class="actions"><button type="submit">Sign in</button></div>
     </form>`,
  );
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} · Huspee</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:16px}main{max-width:480px;margin:40px auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 4px #0002}
h1{color:#ee4d2d;font-size:22px}label{display:block;margin:10px 0}input[type=email],input[type=password]{width:100%;padding:8px;box-sizing:border-box}
.shop{padding:10px;border:1px solid #ddd;border-radius:6px}.actions{margin-top:16px;display:flex;gap:8px}button{background:#ee4d2d;color:#fff;border:0;padding:10px 16px;border-radius:4px;cursor:pointer}
button.secondary{background:#999}.err{color:#b00020}.muted{color:#666;font-size:13px}</style></head>
<body><main><h1>${esc(title)}</h1>${body}<p class="muted">Huspee simulated marketplace — not affiliated with Shopee.</p></main></body></html>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
