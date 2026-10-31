import { Module } from '@nestjs/common';
import { SessionGuard } from '../../auth/session.guard';
import { SessionService } from '../../auth/session.service';
import { PrismaService } from '../../common/prisma.service';
import { AssistantModule } from '../assistant.module';
import { CodexAccountController } from './codex-account.controller';
import { CodexAccountService } from './codex-account.service';
import { CodexSetupController } from './codex-setup.controller';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [AssistantModule],
  controllers: [VoiceController, CodexAccountController, CodexSetupController],
  providers: [PrismaService, SessionService, SessionGuard, VoiceService, CodexAccountService],
})
export class VoiceModule {}
