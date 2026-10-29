import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User, UserRole } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../common/crypto';
import { DomainError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { parseInput } from '../common/validation';
import { CurrentUser, Public, SessionGuard } from './session.guard';
import { SessionService } from './session.service';

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional(),
  /** Sellers can also shop; a seller account is created with both roles. */
  account_type: z.enum(['buyer', 'seller']).default('buyer'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export function presentUser(user: User) {
  return {
    user_id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    roles: user.roles.map((r) => r.toLowerCase()),
    create_time: Math.floor(user.createdAt.getTime() / 1000),
  };
}

@Controller('api/v1/auth')
@UseGuards(SessionGuard)
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  @Post('signup')
  @Public()
  async signup(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(signupSchema, body);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new DomainError('CONFLICT', 'Email is already registered');
    const roles: UserRole[] = input.account_type === 'seller' ? ['SELLER', 'BUYER'] : ['BUYER'];
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        phone: input.phone,
        roles,
      },
    });
    await this.sessions.create(user.id, res);
    res.status(201);
    return { data: presentUser(user) };
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(loginSchema, body);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new DomainError('UNAUTHENTICATED', 'Invalid email or password');
    }
    await this.sessions.create(user.id, res);
    return { data: presentUser(user) };
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(req, res);
    return { data: { logged_out: true } };
  }

  @Get('me')
  async me(@CurrentUser() user: User) {
    const memberships = await this.prisma.shopMember.findMany({
      where: { userId: user.id },
      include: { shop: { select: { id: true, name: true } } },
      orderBy: { shopId: 'asc' },
    });
    return {
      data: {
        ...presentUser(user),
        shops: memberships.map((m) => ({ shop_id: m.shop.id, shop_name: m.shop.name, role: m.role.toLowerCase() })),
      },
    };
  }
}
