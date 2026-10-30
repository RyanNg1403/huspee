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
  providers: [
    PrismaService,
    CatalogService,
    OrderService,
    ReturnService,
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
