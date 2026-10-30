import { Injectable } from '@nestjs/common';
import type { PendingActionView } from './types';

type ActionEvent = { conversationId: string; action: PendingActionView };

@Injectable()
export class AssistantEvents {
  private readonly listeners = new Set<(event: ActionEvent) => void>();

  emitAction(event: ActionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  onAction(listener: (event: ActionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
