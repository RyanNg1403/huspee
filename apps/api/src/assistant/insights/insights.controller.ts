import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import {
  CurrentUser,
  RequireRole,
  SessionGuard,
} from "../../auth/session.guard";
import { PrismaService } from "../../common/prisma.service";
import { forbidden, notFound, validation } from "../../common/errors";
import { InsightsService } from "./insights.service";
import { SummaryService } from "./summary.service";

@Controller("api/v1/seller/shops/:shopId/assistant")
@UseGuards(SessionGuard)
@RequireRole("SELLER")
export class InsightsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsService,
    private readonly summaries: SummaryService,
  ) {}
  private async member(user: User, shopId: number) {
    if (
      !(await this.prisma.shopMember.findUnique({
        where: { userId_shopId: { userId: user.id, shopId } },
      }))
    )
      throw forbidden();
  }
  @Get("insights")
  async get(
    @CurrentUser() user: User,
    @Param("shopId", ParseIntPipe) shopId: number,
    @Query("from") fromInput?: string,
    @Query("to") toInput?: string,
  ) {
    await this.member(user, shopId);
    const now = Math.floor(Date.now() / 1000);
    const to = toInput === undefined ? now : Number(toInput);
    const from = fromInput === undefined ? to - 30 * 86400 : Number(fromInput);
    if (
      (fromInput !== undefined && !/^\d+$/.test(fromInput)) ||
      (toInput !== undefined && !/^\d+$/.test(toInput)) ||
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to < from ||
      to - from > 90 * 86400 ||
      to > 8640000000000
    )
      throw validation("Invalid insights date range");
    return { data: await this.insights.get(shopId, from, to) };
  }
  @Post("conversations/:id/summary")
  async summarize(
    @CurrentUser() user: User,
    @Param("shopId", ParseIntPipe) shopId: number,
    @Param("id") id: string,
  ) {
    await this.member(user, shopId);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw notFound("Conversation");
    const c = await this.prisma.conversation.findFirst({
      where: { id, shopId, status: "ENDED" },
      select: { id: true },
    });
    if (!c) throw notFound("Conversation");
    return { data: { scheduled: this.summaries.schedule(id) } };
  }
}
