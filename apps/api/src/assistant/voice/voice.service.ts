import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssistantEvents } from '../assistant.events';
import { VoiceCatalogRegistry } from '../voice-catalog';
import { ConversationService } from '../conversation.service';
import { actionText, AssistantToolRegistry } from '../tools/assistant-tool.registry';
import { voiceEnabled } from './voice-enabled';
import { VoiceRuntime } from './voice-runtime';

@Injectable()
export class VoiceService implements OnModuleInit, OnModuleDestroy {
  private voiceCache?: string[];
  readonly runtime: VoiceRuntime;
  private readonly unsubscribe: () => void;
  constructor(
    tools: AssistantToolRegistry,
    conversations: ConversationService,
    events: AssistantEvents,
    private readonly catalog: VoiceCatalogRegistry,
  ) {
    this.runtime = new VoiceRuntime(
      tools,
      (ctx, role, text) =>
        conversations.appendMessage(ctx.conversationId, role === 'user' ? 'USER' : 'ASSISTANT', text),
      (ctx) => conversations.end(ctx.conversationId),
    );
    this.unsubscribe = events.onAction(({ conversationId, action, replaces, initiatedBy }) =>
      this.runtime.action(conversationId, action, replaces ? actionText(action) : undefined, initiatedBy),
    );
  }
  onModuleInit(): void {
    this.catalog.register(this);
  }
  async list(): Promise<string[]> {
    if (!voiceEnabled()) return [];
    if (!this.voiceCache) {
      const voices = await this.runtime.voices();
      if (voices.length) this.voiceCache = voices;
    }
    return this.voiceCache || [];
  }
  /** Forgets the voice list and stops the app-server, so the next session starts with the current login. */
  reset(): void {
    this.voiceCache = undefined;
    this.runtime.close();
  }
  onModuleDestroy(): void {
    this.unsubscribe();
    this.runtime.close();
  }
}
