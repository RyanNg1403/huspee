import { randomUUID } from 'node:crypto';
import { CodexTransport } from './codex-transport';
import { voicePrompt, type VoicePromptConfig } from './prompt';

type Event = Record<string, unknown>;
type Context = { conversationId: string; buyerId: number; shopId: number };
type ToolOutput = { text: string; success: boolean; card?: { kind: string; action?: unknown } };
type ToolRegistry = {
  specs(): Array<{ name: string; description: string; inputSchema: object }>;
  run(name: string, args: unknown, ctx: Context): Promise<ToolOutput>;
};
type Session = {
  context: Context;
  threadId: string;
  listeners: Set<(event: Event) => void>;
  backlog: Event[];
  timer: NodeJS.Timeout;
  answer?: (sdp: string) => void;
  rejectAnswer?: (error: Error) => void;
  closed: boolean;
  mode: 'voice' | 'text';
};

/** Runtime state is ephemeral; identity and tool scope are fixed from the authenticated session. */
export class VoiceRuntime {
  private transport = new CodexTransport();
  private sessions = new Map<string, Session>();
  private threads = new Map<string, Session>();
  private reservations = 0;
  constructor(
    private readonly tools: ToolRegistry,
    private readonly saveTranscript: (ctx: Context, role: 'user' | 'assistant', text: string) => Promise<void>,
    private readonly endConversation: (ctx: Context) => Promise<void>,
  ) {
    this.transport.onMessage = (message) => {
      void this.handle(message).catch(() => undefined);
    };
    this.transport.onExit = () => {
      for (const session of this.sessions.values()) {
        this.emit(session, { type: 'error', message: 'Assistant runtime unavailable' });
        void this.stopSession(session, 'runtime_unavailable', false);
      }
    };
  }
  private emit(session: Session, event: Event): void {
    if (session.listeners.size === 0) {
      session.backlog.push(event);
      if (session.backlog.length > 200) session.backlog.shift();
    } else for (const listener of session.listeners) listener(event);
  }
  private touch(session: Session): void {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      void this.stopSession(session, 'idle_timeout');
    }, 300000);
    session.timer.unref();
  }
  async start(ctx: Context, config: VoicePromptConfig & { voice: string }, sdp: string): Promise<string> {
    return (await this.startSession(ctx, config, sdp))!;
  }
  async startText(ctx: Context, config: VoicePromptConfig & { voice: string }): Promise<void> {
    await this.startSession(ctx, config);
  }
  private async startSession(ctx: Context, config: VoicePromptConfig & { voice: string }, sdp?: string): Promise<string | undefined> {
    const max = Math.max(1, Number(process.env.ASSISTANT_MAX_VOICE_SESSIONS || 2) || 2);
    if (this.sessions.size + this.reservations >= max) throw new Error('assistant_busy');
    this.reservations++;
    let session: Session | undefined;
    let reserved = true;
    try {
      await this.transport.start();
      const response = (await this.transport.request('thread/start', {
        ephemeral: true,
        cwd: process.cwd(),
        approvalPolicy: 'never',
        sandbox: 'read-only',
        dynamicTools: this.tools.specs().map((spec) => ({ type: 'function', ...spec })),
        ...(sdp === undefined ? { developerInstructions: voicePrompt(config) } : {}),
      })) as { thread: { id: string } };
      session = {
        context: ctx,
        threadId: response.thread.id,
        listeners: new Set(),
        backlog: [],
        timer: setTimeout(() => {}, 0),
        closed: false,
        mode: sdp === undefined ? 'text' : 'voice',
      };
      this.sessions.set(ctx.conversationId, session);
      this.reservations--;
      reserved = false;
      this.threads.set(session.threadId, session);
      this.touch(session);
      if (sdp === undefined) return;
      const answer = new Promise<string>((resolve, reject) => {
        session!.answer = resolve;
        session!.rejectAnswer = reject;
      });
      const timeout = setTimeout(() => session?.rejectAnswer?.(new Error('SDP answer timed out')), 30000);
      try {
        const [, sdpAnswer] = await Promise.all([
          this.transport.request('thread/realtime/start', {
            threadId: session.threadId,
            version: 'v3',
            voice: config.voice,
            outputModality: 'audio',
            transport: { type: 'webrtc', sdp },
            includeStartupContext: false,
            clientManagedHandoffs: false,
            prompt: voicePrompt(config),
          }),
          answer,
        ]);
        return sdpAnswer;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (session) await this.stopSession(session, 'start_failed');
      throw error;
    } finally {
      if (reserved) this.reservations--;
    }
  }
  private own(id: string, buyerId: number): Session {
    const session = this.sessions.get(id);
    if (!session || session.context.buyerId !== buyerId) throw new Error('not_found');
    return session;
  }
  subscribe(id: string, buyerId: number, listener: (event: Event) => void): () => void {
    const session = this.own(id, buyerId);
    session.listeners.add(listener);
    for (const event of session.backlog.splice(0)) listener(event);
    this.touch(session);
    return () => {
      session.listeners.delete(listener);
      if (!session.listeners.size) void this.stopSession(session, 'disconnected');
    };
  }
  async text(id: string, buyerId: number, text: string): Promise<void> {
    const session = this.own(id, buyerId);
    this.touch(session);
    if (session.mode === 'text') {
      await this.transport.request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text, text_elements: [] }] });
    } else {
      await this.transport.request('thread/realtime/appendText', { threadId: session.threadId, role: 'user', text });
    }
    this.emit(session, { type: 'transcript', role: 'user', text, final: true, ...(session.mode === 'text' ? { item_id: randomUUID() } : {}) });
    await this.saveTranscript(session.context, 'user', text);
  }
  action(
    id: string,
    action: {
      status: string;
      requires_tap: boolean;
      summary: { title: string };
      result?: { order_sn?: string; return_sn?: string; message?: string };
    },
  ): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.emit(session, { type: 'action', action });
    if (action.requires_tap && (action.status === 'EXECUTED' || action.status === 'CANCELLED'))
      void this.notifyAction(
        id,
        `${action.summary.title}: ${action.status}${action.result ? ` ${JSON.stringify(action.result)}` : ''}`,
      ).catch(() => undefined);
  }
  async notifyAction(id: string, text: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.mode === 'text')
      await this.transport.request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text: `[App] ${text}`, text_elements: [] }] });
    else if (session)
      await this.transport.request('thread/realtime/appendText', {
        threadId: session.threadId,
        role: 'developer',
        text: `[App] ${text}`,
      });
  }
  async stop(id: string, buyerId: number): Promise<void> {
    await this.stopSession(this.own(id, buyerId), null);
  }
  private async stopSession(session: Session, reason: string | null, requestStop = true): Promise<void> {
    if (session.closed) return;
    session.closed = true;
    clearTimeout(session.timer);
    session.rejectAnswer?.(new Error(reason || 'closed'));
    this.sessions.delete(session.context.conversationId);
    this.threads.delete(session.threadId);
    this.emit(session, { type: 'closed', reason });
    if (requestStop && session.mode === 'voice')
      await this.transport.request('thread/realtime/stop', { threadId: session.threadId }, 5000).catch(() => undefined);
    await this.transport.request('thread/unsubscribe', { threadId: session.threadId }, 5000).catch(() => undefined);
    await this.endConversation(session.context).catch(() => undefined);
  }
  async voices(): Promise<string[]> {
    await this.transport.start();
    const result = (await this.transport.request('thread/realtime/listVoices', {})) as { voices?: { v3?: string[] } };
    return result.voices?.v3 || [];
  }
  close(): void {
    for (const session of this.sessions.values()) void this.stopSession(session, 'shutdown', false);
    this.transport.close();
  }
  private async handle(message: { id?: number; method?: string; params?: Record<string, unknown> }): Promise<void> {
    const params = message.params || {};
    const session = this.threads.get(String(params.threadId));
    if (!session) {
      if (message.method === 'item/tool/call' && message.id !== undefined) {
        try {
          this.transport.send({
            id: message.id,
            result: { success: false, contentItems: [{ type: 'inputText', text: 'Session closed.' }] },
          });
        } catch {
          /* Process already exited. */
        }
      }
      return;
    }
    this.touch(session);
    if (message.method === 'thread/realtime/sdp' && typeof params.sdp === 'string') session.answer?.(params.sdp);
    else if (
      message.method === 'thread/realtime/transcript/delta' ||
      message.method === 'thread/realtime/transcript/done'
    ) {
      const role = params.role === 'user' ? 'user' : 'assistant';
      const final = message.method.endsWith('/done');
      const text = String(final ? params.text : params.delta);
      this.emit(session, { type: 'transcript', role, text, final, ...(typeof params.itemId === 'string' ? { item_id: params.itemId } : {}) });
      if (final) await this.saveTranscript(session.context, role, text).catch(() => undefined);
    } else if (session.mode === 'text' && message.method === 'item/agentMessage/delta') {
      this.emit(session, { type: 'transcript', role: 'assistant', text: String(params.delta ?? ''), final: false, item_id: String(params.itemId) });
    } else if (session.mode === 'text' && message.method === 'item/completed') {
      const item = params.item as { type?: string; id?: string; text?: string } | undefined;
      if (item?.type === 'agentMessage' && typeof item.text === 'string') {
        this.emit(session, { type: 'transcript', role: 'assistant', text: item.text, final: true, item_id: item.id });
        await this.saveTranscript(session.context, 'assistant', item.text).catch(() => undefined);
      }
    } else if (message.method === 'item/tool/call' && message.id !== undefined) {
      const name = String(params.tool);
      this.emit(session, { type: 'tool', name, status: 'started' });
      try {
        const output = await this.tools.run(name, params.arguments, session.context);
        this.emit(session, { type: 'tool', name, status: output.success ? 'done' : 'error' });
        if (output.card) this.emit(session, { type: 'card', card: output.card });
        this.transport.send({
          id: message.id,
          result: { success: output.success, contentItems: [{ type: 'inputText', text: output.text }] },
        });
      } catch {
        this.emit(session, { type: 'tool', name, status: 'error' });
        this.transport.send({
          id: message.id,
          result: {
            success: false,
            contentItems: [{ type: 'inputText', text: 'Tool unavailable; offer a seller handoff.' }],
          },
        });
      }
    } else if (message.method === 'thread/realtime/error') {
      this.emit(session, { type: 'error', message: 'Assistant session unavailable' });
      await this.stopSession(session, 'runtime_unavailable');
    } else if (message.method === 'thread/realtime/closed') await this.stopSession(session, 'runtime_closed', false);
  }
}
