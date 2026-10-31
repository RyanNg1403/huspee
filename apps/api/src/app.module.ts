import { ReturnEvidenceController } from './buyer/return-evidence.controller';
import { ReturnEvidenceService } from './domain/return-evidence.service';
import { Module } from '@nestjs/common';
import { VoiceModule } from './assistant/voice/voice.module';
import { APP_FILTER } from '@nestjs/core';
import { AssistantModule } from './assistant/assistant.module';
import { MessagesController } from './assistant/messages.controller';
import { AssistantController } from './assistant/assistant.controller';
import { AuthController } from './auth/auth.controller';
import { SessionGuard } from './auth/session.guard';
import { SessionService } from './auth/session.service';
import { BuyerController } from './buyer/buyer.controller';
import { MarketplaceController } from './buyer/marketplace.controller';
import { CustomApiExceptionFilter } from './common/custom-exception.filter';
import { PrismaService } from './common/prisma.service';
import { CompatController } from './compat/compat.controller';
import { CompatDispatcher } from './compat/compat.dispatcher';
import { COMPAT_PROVIDERS, CompatRegistry } from './compat/compat.registry';
import { AuthOps } from './compat/ops/auth.ops';
import { CustomSignedOps } from './compat/ops/custom.ops';
import { MediaPushOps } from './compat/ops/media-push.ops';
import { OrderOps } from './compat/ops/order.ops';
import { ProductOps } from './compat/ops/product.ops';
import { ReturnsOps } from './compat/ops/returns.ops';
import { ShopOps } from './compat/ops/shop.ops';
import { VoucherOps } from './compat/ops/voucher.ops';
import { CatalogService } from './domain/catalog.service';
import { LogisticsService } from './domain/logistics.service';
import { OrderService } from './domain/order.service';
import { PushService } from './domain/push.service';
import { ReturnService } from './domain/return.service';
import { ShopService } from './domain/shop.service';
import { VoucherService } from './domain/voucher.service';
import { AuthPartnerController } from './partner/auth-partner.controller';
import { OAuthService } from './partner/oauth.service';
import { PartnerService } from './partner/partner.service';
import { PlatformController } from './platform/platform.controller';
import { PlatformCredentialService } from './seller/platform-credential.service';
import { SellerGatewayController } from './seller/seller-gateway.controller';
import { SellerController } from './seller/seller.controller';

const opProviders = [AuthOps, ShopOps, ProductOps, MediaPushOps, VoucherOps, OrderOps, ReturnsOps, CustomSignedOps];

/**
 * Modular monolith: one shared domain layer (domain/*) behind three surfaces —
 * Shopee-compatible /api/v2 (compat/*), custom session /api/v1 (auth, buyer, seller) and
 * project-owned signed extensions (/api/v2/custom/*).
 */
@Module({
  imports: [VoiceModule, AssistantModule],
  controllers: [
    AssistantController,
    MessagesController,
    PlatformController,
    AuthController,
    MarketplaceController,
    BuyerController,
    ReturnEvidenceController,
    SellerController,
    SellerGatewayController,
    // Specific /api/v2 routes must be registered before the generic compat dispatcher.
    AuthPartnerController,
    CompatController,
  ],
  providers: [
    PrismaService,
    SessionService,
    SessionGuard,
    PartnerService,
    OAuthService,
    PlatformCredentialService,
    CatalogService,
    LogisticsService,
    VoucherService,
    OrderService,
    ReturnService,
    ReturnEvidenceService,
    ShopService,
    PushService,
    CompatDispatcher,
    CompatRegistry,
    ...opProviders,
    { provide: COMPAT_PROVIDERS, useFactory: (...ops: unknown[]) => ops, inject: opProviders },
    { provide: APP_FILTER, useClass: CustomApiExceptionFilter },
  ],
})
export class AppModule {}
