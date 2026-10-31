import { ReturnEvidenceService } from '../domain/return-evidence.service';
import { SummaryService } from './insights/summary.service';
import { InsightsService } from './insights/insights.service';
import { InsightsController } from './insights/insights.controller';
import { SessionGuard } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import { Module } from '@nestjs/common';
import { ReturnService } from '../domain/return.service';
import { OrderService } from '../domain/order.service';
import { LogisticsService } from '../domain/logistics.service';
import { VoucherService } from '../domain/voucher.service';
import { PushService } from '../domain/push.service';
import { CatalogService } from '../domain/catalog.service';
import { PrismaService } from '../common/prisma.service';
import { VoiceCatalogRegistry } from './voice-catalog';
import { ActionsService } from './actions.service';
import { AssistantEvents } from './assistant.events';
import { ConversationService } from './conversation.service';
import { AssistantToolRegistry } from './tools/assistant-tool.registry';

@Module({
  controllers: [InsightsController],
  providers: [
    SessionGuard, SessionService, SummaryService, InsightsService,
    PrismaService,
    CatalogService,
    OrderService,
    ReturnService,
    ReturnEvidenceService,
    LogisticsService,
    VoucherService,
    PushService,
    VoiceCatalogRegistry,
    ActionsService,
    AssistantEvents,
    ConversationService,
    AssistantToolRegistry,
  ],
  exports: [VoiceCatalogRegistry, ActionsService, AssistantEvents, ConversationService, AssistantToolRegistry],
})
export class AssistantModule {}
