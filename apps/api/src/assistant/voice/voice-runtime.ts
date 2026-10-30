import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { CodexTransport } from './codex-transport';
import { realtimeIdentity, realtimeVoicePrompt, voicePrompt, type VoicePromptConfig } from './prompt';
import { checkSpeech, detectLanguage, offPersona, promisesAction, speechText, statesFact, type SpeechLanguage } from './speech-check';

type Event = Record<string, unknown>;
function traceValue(value: unknown, key = ''): unknown {
  if (/audio|sdp|token|secret|credential|password|authorization|api.?key/i.test(key)) return '[elided]';
  if (Array.isArray(value)) return value.map((item) => traceValue(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, traceValue(item, name)]));
  return value;
}
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
  /** Tool results and buyer words: the only facts speech may contain. */
  evidence: string[];
  lastUser?: string;
  /** The buyer's last few utterances, so a turn the server starts keeps the conversation's context. */
  recentUser: string[];
  reply?: string;
  readback?: { vi: string; en: string; tap: boolean };
  spoken: Set<string>;
  /** The realtime model handed the current utterance to the thread, or we started a turn ourselves. */
  handoff: boolean;
  turnActive: boolean;
  /** Thread turns we started only to inform the thread; their replies are not spoken. */
  silentTurns: number;
  /** The running thread turn: its ID, the buyer words it answers, and whether it is one of ours to inform. */
  turn?: { id: string; asked?: string; silent: boolean; awaitingWords: boolean };
  /** The running turn's reply is stale (the buyer moved on or tapped the card) and must not be spoken. */
  dropReply: boolean;
  /** The buyer asked something new while a turn was answering an earlier question; answer it next. */
  superseded?: 'handed_off' | 'ask_thread';
  /** App events for the thread that arrived while it was busy; sent when its turn completes. */
  pendingNotes: string[];
  /** handoff_request seen before the matching user transcript arrived. */
  pendingHandoff?: boolean;
};
export type SpeechLog = { kind: 'blocked_unverified' | 'corrected'; text: string; unsupported: string[]; spoken: string };

/** Runtime state is ephemeral; identity and tool scope are fixed from the authenticated session. */
export class VoiceRuntime {
  private transport = new CodexTransport();
  private sessions = new Map<string, Session>();
  private threads = new Map<string, Session>();
  private reservations = 0;
  onTurnCompleted?: (conversationId: string, status: string | undefined) => void;
  onSpeechCheck?: (ctx: Context, log: SpeechLog) => void;
  /** How long a spoken "let me check" may go without a handoff before the server sends the request on. */
  stallMs = 2500;
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
        developerInstructions: voicePrompt(config),
      })) as { thread: { id: string } };
      session = {
        context: ctx,
        threadId: response.thread.id,
        listeners: new Set(),
        backlog: [],
        timer: setTimeout(() => {}, 0),
        closed: false,
        mode: sdp === undefined ? 'text' : 'voice',
        evidence: [],
        spoken: new Set(),
        handoff: false,
        turnActive: false,
        silentTurns: 0,
        dropReply: false,
        recentUser: [],
        pendingNotes: [],
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
            // Thread answers are checked by the backend before the voice says them.
            clientManagedHandoffs: true,
            prompt: realtimeVoicePrompt(config),
            // A developer item weighs more than session instructions with the backend voice model.
            initialItems: [{ role: 'developer', text: realtimeIdentity(config) }],
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
    session.evidence.push(text);
    session.lastUser = text;
    session.handoff = false;
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
    replacement?: string,
  ): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.emit(session, { type: 'action', action });
    if (replacement && action.status === 'PENDING') void this.replaceAction(session, action.requires_tap, replacement).catch(() => undefined);
    const resolved = action.requires_tap && (action.status === 'EXECUTED' || action.status === 'CANCELLED');
    if (resolved && session.mode === 'voice') {
      // A read-back or reply still in flight was written before the tap and would ask for it again.
      session.readback = undefined;
      if (session.turnActive) session.dropReply = true;
    }
    if (session.mode === 'voice' && action.requires_tap) {
      const lang = this.language(session);
      const line =
        action.status === 'CANCELLED'
          ? speechText.cancelled[lang]
          : action.status === 'EXECUTED' && action.result?.order_sn
            ? speechText.orderPlaced[lang]
            : action.status === 'EXECUTED' && action.result?.return_sn
              ? speechText.returnOpened[lang]
              : undefined;
      if (line) void this.speak(session, line);
    }
    if (resolved)
      void this.notifyAction(
        id,
        `${action.summary.title}: ${action.status}${action.result ? ` ${JSON.stringify(action.result)}` : ''}`,
      ).catch(() => undefined);
  }
  /** The buyer edited a confirmation card on screen: read the new summary back and point the thread at the new action. */
  private async replaceAction(session: Session, tap: boolean, text: string): Promise<void> {
    session.evidence.push(text);
    const note = `[App] The buyer edited the confirmation card on screen. The previous action is cancelled; use only this action from now on.\n${text}`;
    if (session.mode === 'text') {
      await this.transport.request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text: note, text_elements: [] }] });
      return;
    }
    const vi = /^readback_vi: (.*)$/m.exec(text)?.[1], en = /^readback_en: (.*)$/m.exec(text)?.[1];
    const lang = this.language(session);
    if (vi && en) await this.speak(session, `${lang === 'en' ? en : vi} ${tap ? speechText.confirmTap[lang] : speechText.confirm[lang]}`);
    session.silentTurns++;
    await this.transport
      .request('turn/start', {
        threadId: session.threadId,
        input: [{ type: 'text', text: `${note}\nThe read-back was already spoken to the buyer. Reply only: OK`, text_elements: [] }],
      })
      .catch(() => {
        session.silentTurns--;
      });
  }
  async notifyAction(id: string, text: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.mode === 'text')
      await this.transport.request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text: `[App] ${text}`, text_elements: [] }] });
    else if (session) {
      await this.transport.request('thread/realtime/appendText', {
        threadId: session.threadId,
        role: 'developer',
        text: `[App] ${text}`,
      });
      // The thread answers the buyer's next questions, so it must know too; this turn's reply is not spoken.
      const note = `[App] ${text}\nThe buyer already heard the outcome. Do not ask them to confirm or tap again. Reply only: OK`;
      if (session.turnActive) session.pendingNotes.push(note);
      else await this.informThread(session, note);
    }
  }
  private async informThread(session: Session, text: string): Promise<void> {
    session.silentTurns++;
    await this.transport
      .request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text, text_elements: [] }] })
      .catch(() => {
        session.silentTurns--;
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
  private language(session: Session): SpeechLanguage {
    return detectLanguage(session.lastUser);
  }
  private async speak(session: Session, text: string): Promise<void> {
    if (session.spoken.size > 50) session.spoken.clear();
    session.spoken.add(text.trim());
    await this.transport.request('thread/realtime/appendSpeech', { threadId: session.threadId, text }).catch(() => undefined);
  }
  private async delegateStalled(session: Session, asked: string | undefined): Promise<void> {
    if (session.closed || session.handoff || session.turnActive || !asked || session.lastUser !== asked) return;
    session.handoff = true;
    await this.transport
      .request('turn/start', { threadId: session.threadId, input: [{ type: 'text', text: withContext(session, asked), text_elements: [] }] })
      .catch(() => {
        session.handoff = false;
      });
  }
  /**
   * The buyer spoke over a turn that is still answering an earlier question: stop that turn and drop
   * its answer, so the next thing said answers the new question instead of finishing the old topic.
   */
  private supersede(session: Session, text: string): void {
    const turn = session.turn;
    if (turn?.awaitingWords) {
      turn.awaitingWords = false;
      turn.asked = text;
      return;
    }
    if (!turn || turn.silent || turn.asked === text || session.dropReply) return;
    session.dropReply = true;
    session.superseded = session.pendingHandoff ? 'handed_off' : 'ask_thread';
    session.readback = undefined;
    void this.transport.request('turn/interrupt', { threadId: session.threadId, turnId: turn.id }).catch(() => undefined);
  }
  /** Speaks the thread's answer for a delegated turn only after every fact in it is backed by evidence. */
  private async speakTurn(session: Session): Promise<void> {
    const lang = this.language(session);
    const readback = session.readback, answer = session.reply;
    session.readback = undefined;
    session.reply = undefined;
    if (session.dropReply) {
      session.dropReply = false;
      return;
    }
    if (session.silentTurns > 0) {
      session.silentTurns--;
      return;
    }
    if (readback) {
      await this.speak(session, `${readback[lang]} ${readback.tap ? speechText.confirmTap[lang] : speechText.confirm[lang]}`);
      return;
    }
    if (!answer) return;
    const check = checkSpeech(answer, session.evidence);
    if (check.ok) return this.speak(session, answer);
    const fallback = speechText.fallback[lang];
    this.onSpeechCheck?.(session.context, { kind: 'blocked_unverified', text: answer, unsupported: check.unsupported, spoken: fallback });
    this.emit(session, { type: 'speech_check', status: 'blocked' });
    await this.speak(session, fallback);
  }
  /**
   * The realtime voice may still say something itself. Unverified facts get an immediate spoken
   * correction, and any real answer it gave without handing off (anything but a short neutral reply
   * such as "Mình nghe rõ") sends the buyer's words to the thread, which answers from tools.
   */
  private async checkOwnSpeech(session: Session, text: string): Promise<void> {
    const spoken = text.trim();
    if (session.spoken.has(spoken)) {
      session.spoken.delete(spoken);
      return;
    }
    const check = checkSpeech(text, session.evidence);
    if (!check.ok) {
      const correction = speechText.correction[this.language(session)];
      this.onSpeechCheck?.(session.context, { kind: 'corrected', text, unsupported: check.unsupported, spoken: correction });
      this.emit(session, { type: 'speech_check', status: 'corrected' });
      await this.speak(session, correction);
    }
    if (session.handoff || session.turnActive || !session.lastUser) return;
    if (!check.ok || statesFact(spoken) || offPersona(spoken) || spoken.length > 80) {
      await this.delegateStalled(session, session.lastUser);
      return;
    }
    if (promisesAction(spoken)) {
      const asked = session.lastUser;
      setTimeout(() => void this.delegateStalled(session, asked), this.stallMs).unref?.();
    }
  }
  private async handle(message: { id?: number; method?: string; params?: Record<string, unknown> }): Promise<void> {
    if (process.env.ASSISTANT_VOICE_TRACE && message.method && message.id === undefined) {
      try {
        appendFileSync(process.env.ASSISTANT_VOICE_TRACE, `${JSON.stringify({ method: message.method, params: traceValue(message.params) })}\n`, { mode: 0o600 });
      } catch {
        // Tracing must not interrupt a conversation.
      }
    }
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
      if (final && role === 'user') {
        session.evidence.push(text);
        session.lastUser = text;
        session.recentUser = [...session.recentUser, text].slice(-4);
        if (!session.turnActive) session.handoff = session.pendingHandoff ?? false;
        else this.supersede(session, text);
        session.pendingHandoff = undefined;
      }
      if (final) await this.saveTranscript(session.context, role, text).catch(() => undefined);
      if (final && role === 'assistant') await this.checkOwnSpeech(session, text);
    } else if (session.mode === 'text' && message.method === 'item/agentMessage/delta') {
      this.emit(session, { type: 'transcript', role: 'assistant', text: String(params.delta ?? ''), final: false, item_id: String(params.itemId) });
    } else if (session.mode === 'text' && message.method === 'item/completed') {
      const item = params.item as { type?: string; id?: string; text?: string } | undefined;
      if (item?.type === 'agentMessage' && typeof item.text === 'string') {
        this.emit(session, { type: 'transcript', role: 'assistant', text: item.text, final: true, item_id: item.id });
        await this.saveTranscript(session.context, 'assistant', item.text).catch(() => undefined);
      }
    } else if (session.mode === 'text' && message.method === 'turn/completed') {
      this.onTurnCompleted?.(session.context.conversationId, (params.turn as { status?: string } | undefined)?.status);
    } else if (session.mode === 'voice' && message.method === 'thread/realtime/itemAdded') {
      if ((params.item as { type?: string } | undefined)?.type === 'handoff_request') {
        session.handoff = true;
        session.pendingHandoff = true;
      }
    } else if (session.mode === 'voice' && message.method === 'turn/started') {
      session.turnActive = true;
      // A handoff can start the turn before the buyer's final transcript arrives; that transcript is its question.
      const awaitingWords = !!session.pendingHandoff;
      session.pendingHandoff = undefined;
      const turnId = (params.turn as { id?: string } | undefined)?.id;
      if (turnId) session.turn = { id: turnId, asked: session.lastUser, silent: session.silentTurns > 0, awaitingWords };
    } else if (session.mode === 'voice' && message.method === 'item/completed') {
      const item = params.item as { type?: string; text?: string } | undefined;
      if (item?.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) session.reply = item.text;
    } else if (session.mode === 'voice' && message.method === 'turn/completed') {
      session.turnActive = false;
      session.handoff = false;
      session.turn = undefined;
      await this.speakTurn(session);
      const note = session.pendingNotes.shift();
      if (note && !session.closed) await this.informThread(session, note);
      if (session.superseded) {
        // Answer what the buyer asked meanwhile. If the voice handed it off, give that turn time to start first.
        const wait = note || session.superseded === 'handed_off' ? this.stallMs : 0;
        session.superseded = undefined;
        const asked = session.lastUser;
        setTimeout(() => void this.delegateStalled(session, asked), wait).unref?.();
      }
    } else if (message.method === 'item/tool/call' && message.id !== undefined) {
      const name = String(params.tool);
      this.emit(session, { type: 'tool', name, status: 'started' });
      try {
        const output = await this.tools.run(name, params.arguments, session.context);
        session.evidence.push(output.text);
        const vi = /^readback_vi: (.*)$/m.exec(output.text)?.[1], en = /^readback_en: (.*)$/m.exec(output.text)?.[1];
        if (vi && en)
          session.readback = { vi, en, tap: Boolean((output.card?.action as { requires_tap?: boolean } | undefined)?.requires_tap) };
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
/** The buyer's latest words, with what they said just before when the server starts the turn itself. */
function withContext(session: Session, asked: string): string {
  const earlier = session.recentUser.slice(0, -1).filter((text) => text !== asked);
  if (!earlier.length || session.recentUser.at(-1) !== asked) return asked;
  return `Earlier the buyer said: ${earlier.map((text) => `"${text.trim()}"`).join(', ')}.\nNow the buyer says: ${asked.trim()}`;
}
