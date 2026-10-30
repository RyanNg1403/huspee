import { Module } from '@nestjs/common';
import { SessionGuard } from '../../auth/session.guard';
import { SessionService } from '../../auth/session.service';
import { PrismaService } from '../../common/prisma.service';
import { AssistantModule } from '../assistant.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [AssistantModule],
  controllers: [VoiceController],
  providers: [PrismaService, SessionService, SessionGuard, VoiceService],
})
export class VoiceModule {}
