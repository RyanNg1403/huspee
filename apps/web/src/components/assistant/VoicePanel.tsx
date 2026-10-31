'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/components/session';
import { AssistantCard, type Action, type Card, type EditOptions } from './cards';
import { messages } from './messages';
import type { ViewedProduct } from './product-context';
import { upsertCard } from './card-state';
import { BargeInGate, InterruptionDetector } from './interruption';
import { startVoiceActivity, type VoiceActivity } from './voice-activity';
import { setMicrophoneEnabled } from './microphone';
import {
  appendFinalTranscript,
  applyChannelEvent,
  type ChannelEvent,
  type TranscriptEntry,
  scopeCallEvent,
} from './transcript';

type LiveEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean; item_id?: string; source?: 'text' | 'voice' }
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'card'; card: Card }
  | { type: 'action'; action: Action }
  | { type: 'closed'; reason: string | null }
  | { type: 'error'; message: string }
  | { type: 'call'; state: 'active' | 'ended'; call_id: string; reason?: string | null };
type HistoryItem = {
  conversation_id: string;
  channel: 'VOICE' | 'TEXT';
  status: 'ACTIVE' | 'ENDED';
  started_at: number;
  preview: string | null;
  message_count: number;
};
type HistoryDetail = HistoryItem & {
  messages: Array<{ role: 'user' | 'assistant'; text: string; created_at: number }>;
  cards: Array<{ card: Record<string, unknown>; created_at: number }>;
};
type Adapter = {
  start: (input: {
    shop_id: number;
    sdp_offer: string;
    lang: string;
    resume_conversation_id?: string;
    item_id?: number;
  }) => Promise<{ conversation_id: string; sdp_answer: string }>;
  startText: (input: {
    shop_id: number;
    lang: string;
    resume_conversation_id?: string;
    item_id?: number;
  }) => Promise<{ conversation_id: string }>;
  history: (shopId: number) => Promise<HistoryItem[]>;
  conversation: (id: string) => Promise<HistoryDetail>;
  text: (id: string, text: string) => Promise<unknown>;
  stop: (id: string) => Promise<unknown>;
  eventsUrl: (id: string) => string;
  startCall: (id: string, sdp: string) => Promise<{ conversation_id: string; sdp_answer: string; call_id: string }>;
  stopCall: (id: string, callId?: string) => Promise<unknown>;
  setContext: (id: string, itemId: number | null) => Promise<{ item_id: number | null }>;
  poll: (id: string, after: number) => Promise<{ events: Record<string, unknown>[]; cursor: number; closed: boolean }>;
  confirm: (id: string, key: string) => Promise<{ action: Action }>;
  options: (id: string) => Promise<EditOptions>;
  edit: (
    id: string,
    input: { quantity: number; model_id: number; line_index?: number },
  ) => Promise<{ action: Action }>;
  cancel: (id: string) => Promise<{ action: Action }>;
};

type TimedCard = { card: Card; at: number };
/** Cards keep the time they first appeared so they sit in the conversation where they arrived. */
function upsertTimed(previous: TimedCard[], incoming: Card, now = Date.now()): TimedCard[] {
  const next = upsertCard(
    previous.map((item) => item.card),
    incoming,
  );
  return next.map((card, i) => ({ card, at: previous[i]?.at ?? now }));
}
type Profile = { shop_name: string; connected?: boolean; greeting: { vi: string; en: string } };

function MicGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3" />
    </svg>
  );
}
function ClockGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
    </svg>
  );
}

/** A stored conversation, read-only: its transcript and the cards its tool results produced. */
function PastConversation({ detail, getOptions }: { detail: HistoryDetail; getOptions: Adapter['options'] }) {
  const items = [
    ...detail.messages.map((message, index) => ({ at: message.created_at, order: index * 2, message })),
    ...detail.cards
      .reduce<TimedCard[]>((cards, entry) => upsertTimed(cards, entry.card as Card, entry.created_at), [])
      .map((entry, index) => ({ at: entry.at, order: index * 2 + 1, card: entry.card })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  return (
    <>
      {items.map((item, index) =>
        'message' in item ? (
          <div key={index} className={`flex ${item.message.role === 'user' ? 'justify-end' : 'gap-2'}`}>
            {item.message.role === 'assistant' && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <MicGlyph className="h-3.5 w-3.5" />
              </span>
            )}
            <p
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                item.message.role === 'user'
                  ? 'rounded-2xl rounded-tr-md bg-primary/85 text-white'
                  : 'rounded-2xl rounded-tl-md bg-white text-gray-700 ring-1 ring-line'
              }`}
            >
              {item.message.text}
            </p>
          </div>
        ) : (
          <div key={index} className="pl-9">
            <AssistantCard
              card={item.card}
              pending
              onAction={() => undefined}
              getOptions={getOptions}
              onEdit={async () => undefined}
            />
          </div>
        ),
      )}
    </>
  );
}

function MicOffGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 4.9 2.3M19 12a7 7 0 0 1-1.2 3.9M5 12a7 7 0 0 0 11 5.7M12 19v3M3 3l18 18" />
    </svg>
  );
}

export function VoicePanel({
  shopId,
  product,
  adapter,
  profile,
  onActiveChange,
  onOpenChange,
}: {
  shopId: number;
  product?: ViewedProduct;
  adapter: Adapter;
  profile?: Profile;
  onActiveChange?: (active: boolean) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT(messages);
  const pathname = usePathname();
  const { lang } = useLang();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [error, setError] = useState('');
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ending'>('idle');
  const callGeneration = useRef(0);
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [cards, setCards] = useState<TimedCard[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [historyList, setHistoryList] = useState<HistoryItem[] | null>(null);
  const [viewing, setViewing] = useState<HistoryDetail | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [earlier, setEarlier] = useState<HistoryDetail | null>(null);
  const [liveId, setLiveId] = useState<string | undefined>(undefined);
  const resources = useRef<{
    pc?: RTCPeerConnection;
    stream?: MediaStream;
    events?: EventSource;
    pollTimer?: number;
    conversationId?: string;
    contextItemId?: number | null;
    callId?: string;
    audio?: HTMLAudioElement;
    audioContext?: AudioContext;
    analyserTimer?: number;
    voiceActivity?: VoiceActivity;
  }>({});
  const [appliedItemId, setAppliedItemId] = useState<number | null>(null);
  const desiredItemId = useRef<number | null>(product?.item_id ?? null);
  desiredItemId.current = product?.item_id ?? null;
  const contextQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollArea = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const resize = () => {
      dock.current?.style.setProperty('--assistant-height', `${viewport.height}px`);
      dock.current?.style.setProperty('--assistant-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
    };
  }, [open]);
  const followConversation = useRef(true);
  const sequence = useRef(0);
  const channelOpened = useRef(false);
  const actionKeys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const stopRef = useRef(adapter.stop);
  stopRef.current = adapter.stop;
  function releaseAudio() {
    callGeneration.current++;
    const current = resources.current;
    if (current.analyserTimer !== undefined) window.clearInterval(current.analyserTimer);
    current.voiceActivity?.stop();
    void current.audioContext?.close().catch(() => undefined);
    if (current.pc) {
      current.pc.onconnectionstatechange = null;
      current.pc.ontrack = null;
      current.pc.close();
    }
    current.stream?.getTracks().forEach((track) => track.stop());
    if (current.audio) { current.audio.pause(); current.audio.srcObject = null; }
    delete current.pc; delete current.stream; delete current.audio; delete current.audioContext;
    delete current.analyserTimer; delete current.voiceActivity; delete current.callId;
    channelOpened.current = false;
    setSpeaking(false);
    setMuted(false);
    setPushToTalk(false);
    setCallState('idle');
  }
  function cleanup(sendStop: boolean) {
    generation.current++;
    releaseAudio();
    const current = resources.current;
    resources.current = {};
    contextQueue.current = Promise.resolve();
    current.events?.close();
    if (current.pollTimer !== undefined) window.clearTimeout(current.pollTimer);
    if (sendStop && current.conversationId) void stopRef.current(current.conversationId).catch(() => undefined);
    setChecking(false);
    setState('idle');
  }
  async function endCall() {
    const id = resources.current.conversationId;
    const callId = resources.current.callId;
    const token = generation.current;
    releaseAudio();
    if (!id) return;
    setCallState('ending');
    try { await adapter.stopCall(id, callId); }
    catch { if (generation.current === token) setError(t('callEndError')); }
    finally { if (generation.current === token) setCallState('idle'); }
  }
  const synchronizeProduct = useCallback(() => {
    const current = resources.current;
    const id = current.conversationId;
    const token = generation.current;
    const desired = desiredItemId.current;
    const work = contextQueue.current.catch(() => undefined).then(async () => {
      if (!id || generation.current !== token || current.contextItemId === desired) return;
      const result = await adapter.setContext(id, desired);
      if (generation.current !== token) return;
      current.contextItemId = result.item_id;
      setAppliedItemId(result.item_id);
    });
    contextQueue.current = work;
    return work;
  }, [adapter]);
  const contextFailure = useRef(() => {});
  contextFailure.current = () => { cleanup(true); setError(t('contextError')); };
  useEffect(() => {
    if (state !== 'active') return;
    const token = generation.current;
    void synchronizeProduct().catch(() => {
      if (generation.current === token) contextFailure.current();
    });
  }, [state, product?.item_id, synchronizeProduct]);
  useEffect(() => {
    onActiveChange?.(state !== 'idle');
  }, [state, onActiveChange]);
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  async function openHistory() {
    setView('history');
    setViewing(null);
    setHistoryError(false);
    try {
      setHistoryList(await adapter.history(shopId));
    } catch {
      setHistoryError(true);
    }
  }
  async function openConversation(id: string) {
    if (id === liveId && state !== 'idle') {
      setView('chat');
      return;
    }
    setHistoryError(false);
    try {
      setViewing(await adapter.conversation(id));
    } catch {
      setHistoryError(true);
    }
  }
  function continueConversation(detail: HistoryDetail) {
    setEarlier(detail);
    setViewing(null);
    setView('chat');
    void start(false, detail.conversation_id);
  }
  useEffect(() => {
    const area = scrollArea.current;
    if (area && followConversation.current) area.scrollTop = area.scrollHeight;
  }, [entries, cards, checking]);
  useEffect(
    () => () => {
      generation.current++;
      callGeneration.current++;
      const current = resources.current;
      if (current.analyserTimer !== undefined) window.clearInterval(current.analyserTimer);
      current.voiceActivity?.stop();
      void current.audioContext?.close().catch(() => undefined);
      current.events?.close();
      if (current.pollTimer !== undefined) window.clearTimeout(current.pollTimer);
      current.pc?.close();
      current.stream?.getTracks().forEach((track) => track.stop());
      if (current.audio) {
        current.audio.pause();
        current.audio.srcObject = null;
      }
      if (current.conversationId) void stopRef.current(current.conversationId).catch(() => undefined);
    },
    [],
  );
  function onEvent(event: LiveEvent) {
    if (event.type === 'call' && event.state === 'ended' && event.call_id === resources.current.callId) {
      releaseAudio();
      if (event.reason) setError(t('callDropped'));
    }
    if (event.type === 'transcript' && (event.source === 'text' || !channelOpened.current)) {
      const id = sequence.current++;
      const now = Date.now();
      setEntries((previous) =>
        appendFinalTranscript(previous, event, id).map((entry) =>
          entry.createdAt === undefined ? { ...entry, id: event.source === 'voice' ? `call-fallback-${callGeneration.current}-${entry.id}` : entry.id, createdAt: now } : entry,
        ),
      );
    }
    if (event.type === 'tool') setChecking(event.status === 'started');
    if (event.type === 'card') setCards((previous) => upsertTimed(previous, event.card));
    if (event.type === 'action')
      setCards((previous) => upsertTimed(previous, { kind: 'action', action: event.action }));
    if (event.type === 'closed') cleanup(false);
    if (event.type === 'error') setError(t('error'));
  }
  function connectEvents(id: string) {
    // Cloudflare Quick Tunnels buffer SSE; use finite, cursor-based JSON requests there.
    if (window.location.hostname.endsWith('.trycloudflare.com')) {
      const token = generation.current;
      let cursor = 0;
      let failures = 0;
      const poll = async () => {
        try {
          const result = await adapter.poll(id, cursor);
          if (generation.current !== token) return;
          failures = 0;
          cursor = result.cursor;
          for (const event of result.events) {
            if (generation.current !== token) return;
            onEvent(event as LiveEvent);
          }
          if (result.closed && generation.current === token) cleanup(false);
        } catch {
          if (generation.current !== token) return;
          if (++failures >= 3) {
            setError(t('unavailable'));
            cleanup(true);
            return;
          }
        }
        if (generation.current === token) resources.current.pollTimer = window.setTimeout(poll, failures ? 1500 : 600);
      };
      void poll();
      return;
    }
    const events = new EventSource(adapter.eventsUrl(id), { withCredentials: true });
    resources.current.events = events;
    events.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data) as LiveEvent);
      } catch {
        setError(t('error'));
      }
    };
    events.onerror = () => {
      setError(t('unavailable'));
      cleanup(false);
    };
  }
  async function start(textOnly = false, resumeId?: string) {
    if (resources.current.conversationId) {
      if (!textOnly) await startCall();
      return;
    }
    if (!resumeId) setEarlier(null);
    followConversation.current = true;
    setError('');
    setState('connecting');
    setEntries([]);
    setCards([]);
    channelOpened.current = false;
    const token = ++generation.current;
    const itemId = desiredItemId.current;
    try {
      const result = await adapter.startText({ shop_id: shopId, lang, resume_conversation_id: resumeId, item_id: itemId ?? undefined });
      if (generation.current !== token) {
        void adapter.stop(result.conversation_id).catch(() => undefined);
        return;
      }
      resources.current.conversationId = result.conversation_id;
      resources.current.contextItemId = itemId;
      setAppliedItemId(itemId);
      setLiveId(result.conversation_id);
      connectEvents(result.conversation_id);
      setState('active');
      if (!textOnly) await startCall();
    } catch {
      if (generation.current !== token) return;
      setError(t('unavailable'));
      cleanup(true);
    }
  }
  async function startCall() {
    const id = resources.current.conversationId;
    if (!id || resources.current.pc || callState === 'ending') return;
    const token = ++callGeneration.current;
    let joinedCallId: string | undefined;
    setCallState('connecting');
    setError('');
    try {
      await synchronizeProduct();
      if (callGeneration.current !== token) return;
      if (!window.isSecureContext) throw new Error('secureContext');
      if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) throw new Error('microphone');
      let stream: MediaStream | undefined;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new Error('microphone');
      }
      if (callGeneration.current !== token) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = stream;
      const pc = new RTCPeerConnection();
      resources.current.pc = pc;
      pc.onconnectionstatechange = () => {
        if (
          callGeneration.current === token &&
          (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
        ) {
          setError(t('callDropped'));
          void endCall();
        }
      };
      if (stream) pc.addTrack(stream.getAudioTracks()[0], stream);
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      let assistantPlaying = false;
      let speechStart: number | undefined;
      const gate = new BargeInGate();
      const audio = new Audio();
      audio.autoplay = true;
      resources.current.audio = audio;
      let micAnalyser: AnalyserNode | undefined;
      let remoteAnalyser: AnalyserNode | undefined;
      let context: AudioContext | undefined;
      try {
        context = new AudioContext();
        resources.current.audioContext = context;
        micAnalyser = context.createAnalyser();
        micAnalyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(micAnalyser);
        await context.resume();
        if (callGeneration.current !== token) {
          void context.close().catch(() => undefined);
          return;
        }
        const detector = new InterruptionDetector();
        // Silero tells speech from noise; until it has loaded (or if it cannot), loudness alone is used.
        void startVoiceActivity(stream, context)
          .then((activity) => {
            if (callGeneration.current === token) resources.current.voiceActivity = activity;
            else activity.stop();
          })
          .catch(() => undefined);
        const rms = (analyser: AnalyserNode | undefined) => {
          if (!analyser) return 0;
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        };
        resources.current.analyserTimer = window.setInterval(() => {
          if (!remoteAnalyser) return;
          const remote = rms(remoteAnalyser);
          const detected = detector.sample(
            Date.now(),
            rms(micAnalyser),
            remote,
            assistantPlaying || remote > 0.01,
            resources.current.voiceActivity?.probability(Date.now()),
          );
          if (detected !== undefined) speechStart = detected;
          const volume = gate.sample(Date.now(), detector.ducking, detected !== undefined, remote < 0.005);
          audio.muted = volume === 0;
          audio.volume = volume || 1;
        }, 50);
      } catch {
        void context?.close().catch(() => undefined);
        context = undefined;
      }
      const channel = pc.createDataChannel('oai-events');
      channel.onopen = () => {
        if (callGeneration.current !== token) return;
        channelOpened.current = true;
        setEntries((previous) => previous.filter((entry) => !entry.id.startsWith(`call-fallback-${token}-`)));
      };
      channel.onmessage = (event) => {
        if (callGeneration.current !== token || typeof event.data !== 'string') return;
        try {
          const payload = scopeCallEvent(JSON.parse(event.data) as ChannelEvent, String(token));
          const now = Date.now();
          const role = 'turn' in payload ? (payload.turn as { role?: string } | undefined)?.role : undefined;
          if (
            (payload.type === 'turn.created' || payload.type === 'turn.done') &&
            (payload.turn as { role?: string } | undefined)?.role === 'assistant'
          ) {
            assistantPlaying = payload.type === 'turn.created';
            setSpeaking(assistantPlaying);
          }
          if (payload.type === 'turn.created') {
            if (role === 'user') gate.buyerTurn();
            else if (role === 'assistant') {
              gate.assistantTurn();
              audio.muted = false;
              audio.volume = 1;
            }
          }
          const detection = {
            available: context?.state === 'running' && !!micAnalyser && !!remoteAnalyser,
            speechStart,
          };
          setEntries((previous) => applyChannelEvent(previous, payload, now, detection));
        } catch {
          // Ignore non-JSON protocol messages.
        }
      };
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        if (context && event.streams[0]) {
          try {
            remoteAnalyser = context.createAnalyser();
            remoteAnalyser.fftSize = 1024;
            context.createMediaStreamSource(event.streams[0]).connect(remoteAnalyser);
          } catch {
            remoteAnalyser = undefined;
          }
        }
        void audio.play().catch(() => setError(t('error')));
      };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const timeout = window.setTimeout(resolve, 2500);
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') {
            window.clearTimeout(timeout);
            resolve();
          }
        });
      });
      if (callGeneration.current !== token) return;
      const result = await adapter.startCall(id, pc.localDescription?.sdp ?? '');
      if (callGeneration.current !== token) {
        void adapter.stopCall(id, result.call_id).catch(() => undefined);
        return;
      }
      joinedCallId = result.call_id;
      resources.current.callId = result.call_id;
      await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp_answer });
      if (callGeneration.current !== token) return;
      setMuted(false);
      setPushToTalk(false);
      setCallState('active');
    } catch (e) {
      if (callGeneration.current !== token) return;
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code).toLowerCase() : '';
      const microphone =
        (e instanceof DOMException &&
          ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) ||
        (e instanceof Error && e.message === 'microphone');
      setError(
        e instanceof Error && e.message === 'secureContext'
          ? t('secureContext')
          : microphone
            ? t('microphone')
            : code === 'assistant_busy'
              ? t('busy')
              : t('unavailable'),
      );
      releaseAudio();
      if (joinedCallId) await adapter.stopCall(id, joinedCallId).catch(() => undefined);
    }
  }
  async function send(override?: string) {
    const text = (override ?? message).trim();
    const id = resources.current.conversationId;
    if (!text || !id || busy || callState === 'connecting' || callState === 'ending') return;
    setBusy(true);
    try {
      await synchronizeProduct();
      if (resources.current.conversationId !== id) return;
      await adapter.text(id, text);
      if (override === undefined) setMessage('');
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  async function ask(text: string) {
    if (state === 'idle') await start(true);
    await send(text);
  }
  async function action(action: Action, confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      const key = actionKeys.current.get(action.action_id) ?? crypto.randomUUID();
      actionKeys.current.set(action.action_id, key);
      const result = confirm
        ? await adapter.confirm(action.action_id, key)
        : await adapter.cancel(action.action_id);
      setCards((previous) => upsertTimed(previous, { kind: 'action', action: result.action }));
      window.dispatchEvent(new Event('huspee:cart-changed'));
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  const shopName = profile?.shop_name ?? t('open');
  const greeting = (lang === 'en' ? profile?.greeting.en : profile?.greeting.vi) || t('greetingFallback');
  const voiceActive = callState === 'active';
  const status =
    callState === 'connecting'
      ? t('calling')
      : state === 'connecting'
      ? t('connecting')
      : state !== 'active'
        ? t('subtitle')
        : checking
          ? t('checking')
          : speaking
            ? t('speaking')
            : voiceActive
              ? muted || pushToTalk
                ? t('muted')
                : t('listening')
              : t('online');
  const timeline: Array<
    { kind: 'entry'; entry: TranscriptEntry } | { kind: 'card'; card: Card; index: number }
  > = [];
  {
    let c = 0;
    for (const entry of entries) {
      while (c < cards.length && entry.createdAt !== undefined && cards[c]!.at < entry.createdAt) {
        timeline.push({ kind: 'card', card: cards[c]!.card, index: c });
        c++;
      }
      timeline.push({ kind: 'entry', entry });
    }
    for (; c < cards.length; c++) timeline.push({ kind: 'card', card: cards[c]!.card, index: c });
  }
  const suggestions = [t('suggest1'), t('suggest2'), t('suggest3'), t('suggest4')];
  const canChat = session.status === 'authenticated';
  const roundButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-gray-700 transition hover:bg-gray-50 disabled:opacity-40';
  return (
    <div
      ref={dock}
      className={`assistant-dock fixed right-4 bottom-4 z-50 flex flex-col items-end sm:right-6 sm:bottom-6 ${open ? 'assistant-dock-open' : ''}`}
    >
      {open && (
        <section
          className="assistant-panel mb-3 flex h-[min(78dvh,42rem,calc(100dvh-7rem))] w-[min(calc(100vw-2rem),25rem)] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-panel"
          aria-label={t('open')}
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <MicGlyph className="h-5 w-5" />
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-white ${state === 'active' ? 'bg-emerald-500' : state === 'connecting' ? 'bg-amber-400' : 'bg-gray-300'}`}
              />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm font-semibold text-ink">{shopName}</strong>
              <span className="flex items-center gap-1.5 text-xs text-gray-500" aria-live="polite">
                {state === 'active' && (checking || speaking || (voiceActive && !muted && !pushToTalk)) && (
                  <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className="w-[3px] animate-pulse rounded-full bg-primary"
                        style={{ height: `${[60, 100, 40][bar]}%`, animationDelay: `${bar * 150}ms` }}
                      />
                    ))}
                  </span>
                )}
                <span className="truncate">{status}</span>
              </span>
            </div>
            {state === 'active' && (
              <button
                onClick={() => cleanup(true)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                {t('stop')}
              </button>
            )}
            {session.status === 'authenticated' && (
              <button
                onClick={() => (view === 'history' ? setView('chat') : void openHistory())}
                aria-label={view === 'history' ? t('back') : t('history')}
                aria-pressed={view === 'history'}
                title={t('history')}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-gray-100 ${view === 'history' ? 'bg-primary-soft text-primary' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ClockGlyph className="h-5 w-5" />
              </button>
            )}
            {/* Closing only hides the panel; the conversation keeps running until Stop. */}
            <button
              onClick={() => setOpen(false)}
              aria-label={t('close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          {view === 'chat' && product && (
            <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-3 border-b border-line bg-primary-soft px-4 py-3" data-testid="product-context-notice">
              {product.image && (
                // Product media shares the storefront's image handling.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line bg-surface object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">{state === 'idle' ? t('contextReady') : appliedItemId === product.item_id ? t('contextUsing') : t('contextUpdating')}</p>
                <Link href={`/products/${product.item_id}`} className="mt-0.5 block truncate text-sm font-semibold text-ink hover:text-primary" title={product.name}>{product.name}</Link>
              </div>
            </div>
          )}
          {session.status === 'anonymous' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
                <MicGlyph className="h-7 w-7" />
              </span>
              <p className="text-sm text-gray-600">{t('signIn')}</p>
              <Link
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
                href={`/login?next=${encodeURIComponent(pathname)}`}
              >
                {t('login')}
              </Link>
            </div>
          ) : session.status === 'authenticated' && !session.user?.roles.includes('buyer') ? (
            <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-600">
              {t('buyerOnly')}
            </p>
          ) : profile?.connected === false && state === 'idle' && view === 'chat' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <MicOffGlyph className="h-7 w-7" />
              </span>
              <strong className="text-sm font-semibold text-ink">{t('notConnectedTitle')}</strong>
              <p className="text-sm text-gray-600">{t('notConnected')}</p>
            </div>
          ) : view === 'history' ? (
            <div className="flex-1 overflow-y-auto bg-gray-50/60 px-4 py-4">
              {viewing ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setViewing(null)}
                    className="text-xs font-semibold text-gray-600 hover:text-primary"
                  >
                    ← {t('back')}
                  </button>
                  <p className="text-xs text-gray-500">{formatDateTime(viewing.started_at, lang)}</p>
                  <PastConversation detail={viewing} getOptions={adapter.options} />
                  {state === 'idle' && (
                    <button
                      disabled={!canChat}
                      onClick={() => continueConversation(viewing)}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                    >
                      <MicGlyph className="h-4 w-4" />
                      {t('continueChat')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-ink">{t('history')}</h3>
                  {historyError && (
                    <button onClick={() => void openHistory()} className="text-sm text-red-600">
                      {t('loadFailed')}
                    </button>
                  )}
                  {!historyError && historyList === null && (
                    <span className="block h-5 w-5 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                  )}
                  {historyList?.length === 0 && <p className="text-sm text-gray-500">{t('noHistory')}</p>}
                  {historyList?.map((item) => (
                    <button
                      key={item.conversation_id}
                      onClick={() => void openConversation(item.conversation_id)}
                      className="block w-full rounded-2xl bg-white p-3 text-left shadow-card ring-1 ring-line transition hover:ring-primary/40"
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span>{formatDateTime(item.started_at, lang)}</span>
                        <span>
                          {item.conversation_id === liveId && state !== 'idle'
                            ? t('ongoing')
                            : item.channel === 'VOICE'
                              ? t('voiceChannel')
                              : t('textChannel')}
                          {' · '}
                          {t('messagesCount', { n: item.message_count })}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm text-gray-800">
                        {item.preview ?? '…'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                ref={scrollArea}
                onScroll={(event) => {
                  const area = event.currentTarget;
                  followConversation.current = area.scrollHeight - area.scrollTop - area.clientHeight < 48;
                }}
                className="flex-1 space-y-3 overflow-y-auto bg-gray-50/60 px-4 py-4"
                aria-live="polite"
              >
                <div className="flex gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <MicGlyph className="h-3.5 w-3.5" />
                  </span>
                  <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 shadow-card ring-1 ring-line">
                    {greeting}
                  </p>
                </div>
                {earlier && (
                  <>
                    <p className="text-center text-[11px] font-medium tracking-wide text-gray-400 uppercase">
                      {t('earlier')} · {formatDateTime(earlier.started_at, lang)}
                    </p>
                    <div className="space-y-3 opacity-75">
                      <PastConversation detail={earlier} getOptions={adapter.options} />
                    </div>
                    <hr className="border-line" />
                  </>
                )}
                {state === 'idle' && entries.length === 0 && cards.length === 0 && (
                  <div className="flex flex-col items-center gap-3 pt-6 pb-2">
                    <button
                      onClick={() => void start()}
                      disabled={!canChat}
                      className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-lift transition hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                    >
                      <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.2s]" />
                      <MicGlyph className="relative h-8 w-8" />
                      <span className="sr-only">{t('start')}</span>
                    </button>
                    <span className="text-sm font-medium text-gray-700">{t('tapToTalk')}</span>
                    <p className="mt-3 text-xs font-medium tracking-wide text-gray-400 uppercase">
                      {t('orAsk')}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map((text) => (
                        <button
                          key={text}
                          disabled={!canChat || busy}
                          onClick={() => void ask(text)}
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {timeline.map((item) =>
                  item.kind === 'entry' ? (
                    <div
                      key={`e-${item.entry.id}`}
                      className={`flex ${item.entry.role === 'user' ? 'justify-end' : 'gap-2'}`}
                    >
                      {item.entry.role === 'assistant' && (
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                          <MicGlyph className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <p
                        className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                          item.entry.role === 'user'
                            ? 'rounded-2xl rounded-tr-md bg-primary text-white'
                            : 'rounded-2xl rounded-tl-md bg-white text-gray-800 shadow-card ring-1 ring-line'
                        } ${item.entry.final ? '' : 'opacity-70'}`}
                      >
                        {item.entry.text}
                        {item.entry.cutOff && (
                          <span className={item.entry.role === 'user' ? 'text-white/70' : 'text-gray-400'}>
                            {' '}
                            ({t('cutOff')})
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div key={`c-${item.index}`} className="pl-9">
                      <AssistantCard
                        card={item.card}
                        pending={busy}
                        onAction={(target, confirm) => void action(target, confirm)}
                        getOptions={adapter.options}
                        onEdit={async (target, input) => {
                          setBusy(true);
                          try {
                            const result = await adapter.edit(target.action_id, input);
                            setCards((previous) =>
                              upsertTimed(previous, { kind: 'action', action: result.action }),
                            );
                          } catch {
                            setError(t('error'));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </div>
                  ),
                )}
                {checking && (
                  <div className="flex items-center gap-2 pl-9 text-xs text-gray-500">
                    <span className="flex gap-1" aria-hidden="true">
                      {[0, 1, 2].map((dotIndex) => (
                        <span
                          key={dotIndex}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: `${dotIndex * 120}ms` }}
                        />
                      ))}
                    </span>
                    {t('checking')}
                  </div>
                )}
                {error && (
                  <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>
              <div className="border-t border-line bg-white p-3">
                {state === 'idle' && (entries.length > 0 || cards.length > 0) && (
                  <div className="flex gap-2">
                    <button
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                      disabled={!canChat}
                      onClick={() => void start()}
                    >
                      <MicGlyph className="h-4 w-4" />
                      {t('start')}
                    </button>
                    <button
                      className="h-11 rounded-full border border-line px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      disabled={!canChat}
                      onClick={() => void start(true)}
                    >
                      {t('type')}
                    </button>
                  </div>
                )}
                {state === 'idle' && entries.length === 0 && cards.length === 0 && (
                  <button
                    className="h-10 w-full rounded-full text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                    disabled={!canChat}
                    onClick={() => void start(true)}
                  >
                    {t('type')}
                  </button>
                )}
                {state === 'connecting' && (
                  <p className="flex h-11 items-center justify-center gap-2 text-sm text-gray-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                    {t('connecting')}
                  </p>
                )}
                {state === 'active' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 text-xs text-muted">{t('sharedChat')}</p>
                      <button
                        type="button"
                        className={`flex h-11 shrink-0 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold transition disabled:opacity-50 ${callState === 'idle' ? 'text-primary hover:bg-primary-soft' : 'text-red-600 hover:bg-red-50'}`}
                        disabled={callState === 'ending' || busy}
                        onClick={() => void (callState === 'idle' ? startCall() : endCall())}
                      >
                        {callState === 'idle' ? <MicGlyph className="h-4 w-4" /> : <MicOffGlyph className="h-4 w-4" />}
                        {callState === 'idle' ? t('call') : callState === 'connecting' ? t('cancelCall') : callState === 'ending' ? t('endingCall') : t('endCall')}
                      </button>
                    </div>
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      {resources.current.stream && !pushToTalk && (
                        <button
                          type="button"
                          className={`${roundButton} ${muted ? 'border-red-200 bg-red-50 text-red-600' : ''}`}
                          aria-label={muted ? t('unmute') : t('mute')}
                          aria-pressed={muted}
                          onClick={() => {
                            const next = !muted;
                            setMicrophoneEnabled(resources.current.stream, !next);
                            setMuted(next);
                          }}
                        >
                          {muted ? <MicOffGlyph className="h-5 w-5" /> : <MicGlyph className="h-5 w-5" />}
                        </button>
                      )}
                      {resources.current.stream && pushToTalk && (
                        <button
                          type="button"
                          className={`${roundButton} touch-none select-none border-primary bg-primary-soft text-primary active:bg-primary active:text-white`}
                          aria-label={t('holdToTalk')}
                          onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setMicrophoneEnabled(resources.current.stream, true);
                          }}
                          onPointerUp={() => setMicrophoneEnabled(resources.current.stream, false)}
                          onPointerCancel={() => setMicrophoneEnabled(resources.current.stream, false)}
                          onKeyDown={(event) => {
                            if (event.key === ' ' || event.key === 'Enter')
                              setMicrophoneEnabled(resources.current.stream, true);
                          }}
                          onKeyUp={(event) => {
                            if (event.key === ' ' || event.key === 'Enter')
                              setMicrophoneEnabled(resources.current.stream, false);
                          }}
                          onBlur={() => setMicrophoneEnabled(resources.current.stream, false)}
                        >
                          <MicGlyph className="h-5 w-5" />
                        </button>
                      )}
                      <div className="relative min-w-0 flex-1">
                        <input
                          className="h-11 w-full rounded-full border border-transparent bg-gray-100 pr-12 pl-4 text-sm transition placeholder:text-gray-500 focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:outline-none"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder={t('placeholder')}
                          aria-label={t('placeholder')}
                        />
                        <button
                          disabled={busy || !message.trim() || callState === 'connecting' || callState === 'ending'}
                          aria-label={t('send')}
                          className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:bg-gray-300"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </form>
                    {resources.current.stream && (
                      <label className="flex cursor-pointer items-center justify-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={pushToTalk}
                          onChange={() => {
                            const next = !pushToTalk;
                            setMicrophoneEnabled(resources.current.stream, !next && !muted);
                            setPushToTalk(next);
                          }}
                        />
                        {t('pushToTalk')}
                        {pushToTalk && <span className="text-gray-400">· {t('holdToTalk')}</span>}
                      </label>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
      <button
        className={`flex h-14 items-center gap-2.5 rounded-full bg-primary pr-5 pl-4 text-sm font-semibold text-white shadow-lift transition hover:bg-primary-hover active:scale-95 ${open ? 'pr-4' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('open')}
      >
        {open ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : (
          <>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <MicGlyph className="h-4 w-4" />
              {state === 'active' && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-primary" />
              )}
            </span>
            {t('launcher')}
          </>
        )}
      </button>
    </div>
  );
}
