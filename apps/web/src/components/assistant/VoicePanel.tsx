'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { useSession } from '@huspee/web-ui/components/session';
import { AssistantCard, type Action, type Card, type EditOptions } from '@huspee/web-ui/components/assistant/cards';
import { messages, type AssistantMessageKey } from '@huspee/web-ui/components/assistant/messages';
import { AssistantBubble, ToolLine, UserBubble } from './Bubbles';
import { ContextRow } from './ContextRow';
import { ConversationProducts } from './ConversationProducts';
import { collectConversationProducts, type ConversationProduct } from './conversation-products';
import { HistoryView, PastConversation, type HistoryDetail, type HistoryItem } from './HistoryView';
import { ClockGlyph, MicOffGlyph } from './icons';
import { upsertTimed } from './card-state';
import { BargeInGate, InterruptionDetector } from './interruption';
import { LauncherBar, PanelRail } from './Launchers';
import { setMicrophoneEnabled } from './microphone';
import { OPEN_ASSISTANT_EVENT } from './open-assistant';
import { CallControls, PanelFooter } from './PanelFooter';
import { PanelHeader } from './PanelHeader';
import { failureOf, panelStatus } from './panel-status';
import type { ViewedOrder, ViewedProduct } from './product-context';
import { StateBlock } from './StateBlock';
import {
  applyToolEvent,
  awaitingConfirmation,
  buildTimeline,
  settleTools,
  type TimedCard,
  type ToolRun,
} from './timeline';
import {
  appendFinalTranscript,
  applyChannelEvent,
  type ChannelEvent,
  type TranscriptEntry,
  scopeCallEvent,
} from './transcript';
import { useFocusTrap } from './use-focus-trap';
import { SHEET_QUERY, useMediaQuery } from './use-media-query';
import { startVoiceActivity, type VoiceActivity } from './voice-activity';

type LiveEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean; item_id?: string; source?: 'text' | 'voice' }
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'card'; card: Card; source?: 'text' | 'voice' }
  | { type: 'action'; action: Action }
  | { type: 'closed'; reason: string | null }
  | { type: 'error'; message: string }
  | { type: 'call'; state: 'active' | 'ended'; call_id: string; reason?: string | null };
export type Adapter = {
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
export type Profile = { shop_name: string; connected?: boolean; greeting: { vi: string; en: string } };
/** The page the panel is opened from; without it (a cart page, say) the live chat just continues. */
export type PanelPage = { product?: ViewedProduct; order?: ViewedOrder };

/** Arrival stamps that never repeat, so items that land in the same millisecond keep their order. */
function createClock() {
  let last = 0;
  return () => (last = Math.max(Date.now(), last + 1));
}
const subscribeToDocument = () => () => {};
const getDocumentBody = () => document.body;
const getServerBody = () => null;

export function VoicePanel({
  visible = true,
  shopId,
  page,
  adapter,
  profile,
  logo,
  pinned,
  sheet,
  onPinnedChange,
  onSheetChange,
  onActiveChange,
}: {
  visible?: boolean;
  shopId: number;
  page?: PanelPage;
  adapter: Adapter;
  profile?: Profile;
  logo?: string | null;
  /** Wide screens: the panel is pinned open (otherwise a rail). */
  pinned: boolean;
  /** Phones: the bottom sheet is open (otherwise a launcher bar). */
  sheet: boolean;
  onPinnedChange: (open: boolean) => void;
  onSheetChange: (open: boolean) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const t = useT(messages);
  const portalTarget = useSyncExternalStore(subscribeToDocument, getDocumentBody, getServerBody);
  const pathname = usePathname();
  const { lang } = useLang();
  const session = useSession();
  const phone = useMediaQuery(SHEET_QUERY);
  const product = page?.product;
  const order = page?.order;
  const [state, setState] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [error, setError] = useState<AssistantMessageKey | ''>('');
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ending'>('idle');
  const callGeneration = useRef(0);
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [holdingToTalk, setHoldingToTalk] = useState(false);
  const [microphone, setMicrophone] = useState<{ stream: MediaStream; analyser?: AnalyserNode; audioContext?: AudioContext } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [cards, setCards] = useState<TimedCard[]>([]);
  const [tools, setTools] = useState<ToolRun[]>([]);
  const [contextProducts, setContextProducts] = useState<ConversationProduct[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [historyList, setHistoryList] = useState<HistoryItem[] | null>(null);
  const [viewing, setViewing] = useState<HistoryDetail | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [earlier, setEarlier] = useState<HistoryDetail | null>(null);
  const [liveId, setLiveId] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [now, setNow] = useState(0);
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
    micAnalyser?: AnalyserNode;
    analyserTimer?: number;
    voiceActivity?: VoiceActivity;
  }>({});
  const contextKey = product ? `product:${product.item_id}` : order ? `order:${order.order_sn}` : null;
  const contextDismissed = contextKey !== null && dismissed === contextKey;
  const [appliedItemId, setAppliedItemId] = useState<number | null>(null);
  const desiredItemId = useRef<number | null>(null);
  const desired = contextDismissed ? null : (product?.item_id ?? null);
  // Declared before the effect that sends it, so that effect reads this render's product.
  useEffect(() => {
    desiredItemId.current = desired;
  }, [desired]);
  const contextQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollArea = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const lastStartTextOnly = useRef(true);
  // Messages, tool lines and cards are ordered by arrival; equal timestamps would lose that order.
  const [tick] = useState(createClock);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!sheet || !viewport) return;
    const resize = () => {
      dock.current?.style.setProperty('--assistant-height', `${viewport.height}px`);
      dock.current?.style.setProperty('--assistant-top', `${viewport.offsetTop}px`);
      dock.current?.style.setProperty('--assistant-left', `${viewport.offsetLeft}px`);
      dock.current?.style.setProperty('--assistant-width', `${viewport.width}px`);
      dock.current?.classList.toggle('assistant-compact-height', viewport.height < 520);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
    };
  }, [sheet]);
  const expiring = cards.some((item) => item.card.kind === 'action' && item.card.action.status === 'PENDING');
  useEffect(() => {
    if (!expiring) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiring]);
  useFocusTrap(panel, visible && phone && sheet, () => onSheetChange(false), launcher);
  useEffect(() => {
    const focusInput = () => {
      if (!window.matchMedia(SHEET_QUERY).matches) window.requestAnimationFrame(() => input.current?.focus());
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, focusInput);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, focusInput);
  }, []);
  const followConversation = useRef(true);
  const sequence = useRef(0);
  const channelOpened = useRef(false);
  const actionKeys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const stopRef = useRef(adapter.stop);
  useEffect(() => {
    stopRef.current = adapter.stop;
  }, [adapter]);
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
    delete current.micAnalyser;
    delete current.analyserTimer; delete current.voiceActivity; delete current.callId;
    channelOpened.current = false;
    setSpeaking(false);
    setMuted(false);
    setPushToTalk(false);
    setHoldingToTalk(false);
    setMicrophone(null);
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
    setTools(settleTools);
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
    catch { if (generation.current === token) setError('callEndError'); }
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
  useEffect(() => {
    contextFailure.current = () => { cleanup(true); setError('contextError'); };
  });
  useEffect(() => {
    if (state !== 'active') return;
    const token = generation.current;
    void synchronizeProduct().catch(() => {
      if (generation.current === token) contextFailure.current();
    });
  }, [state, desired, synchronizeProduct]);
  useEffect(() => {
    onActiveChange?.(state !== 'idle');
  }, [state, onActiveChange]);
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
  }, [entries, cards, tools, error]);
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
      if (event.reason) setError('callDropped');
    }
    if (event.type === 'transcript' && (event.source === 'text' || !channelOpened.current)) {
      const id = sequence.current++;
      const now = tick();
      setEntries((previous) =>
        appendFinalTranscript(previous, event, id).map((entry) =>
          entry.createdAt === undefined ? { ...entry, id: event.source === 'voice' ? `call-fallback-${callGeneration.current}-${entry.id}` : entry.id, createdAt: now } : entry,
        ),
      );
    }
    if (event.type === 'tool') {
      const now = tick();
      const id = sequence.current++;
      setTools((previous) => applyToolEvent(previous, event, now, id));
    }
    if (event.type === 'card') {
      const now = tick();
      setCards((previous) => upsertTimed(previous, event.card, now));
      setContextProducts((previous) => collectConversationProducts(previous, event.card, event.source));
    }
    if (event.type === 'action') {
      const now = tick();
      setCards((previous) => upsertTimed(previous, { kind: 'action', action: event.action }, now));
    }
    if (event.type === 'closed') cleanup(false);
    if (event.type === 'error') setError('error');
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
            setError('unavailable');
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
        setError('error');
      }
    };
    events.onerror = () => {
      setError('unavailable');
      cleanup(false);
    };
  }
  async function start(textOnly = false, resumeId?: string) {
    if (resources.current.conversationId) {
      if (!textOnly) await startCall();
      return;
    }
    lastStartTextOnly.current = textOnly;
    if (!resumeId) setEarlier(null);
    followConversation.current = true;
    setError('');
    setState('connecting');
    setEntries([]);
    setCards([]);
    setTools([]);
    setContextProducts([]);
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
    } catch (e) {
      if (generation.current !== token) return;
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code).toLowerCase() : '';
      setError(code === 'assistant_busy' ? 'busy' : 'unavailable');
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
          setError('callDropped');
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
        resources.current.micAnalyser = micAnalyser;
        // Mobile browsers may suspend analysis until another gesture. The meter offers a resume
        // button; a pending resume must not prevent the WebRTC call from connecting.
        void context.resume().catch(() => undefined);
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
        delete resources.current.micAnalyser;
        context = undefined;
      }
      setMicrophone({ stream, analyser: resources.current.micAnalyser, audioContext: resources.current.audioContext });
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
          const now = tick();
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
        void audio.play().catch(() => setError('error'));
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
      setCallState('active');
    } catch (e) {
      if (callGeneration.current !== token) return;
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code).toLowerCase() : '';
      const microphone =
        (e instanceof DOMException &&
          ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) ||
        (e instanceof Error && e.message === 'microphone');
      const secure = e instanceof Error && e.message === 'secureContext';
      setError(secure ? 'secureContext' : microphone ? 'microphone' : code === 'assistant_busy' ? 'busy' : 'unavailable');
      // Typing keeps working when the microphone does not.
      if (secure || microphone) setTyping(true);
      releaseAudio();
      if (joinedCallId) await adapter.stopCall(id, joinedCallId).catch(() => undefined);
    }
  }
  async function send(text: string): Promise<boolean> {
    const id = resources.current.conversationId;
    if (!text || !id || busy || callState === 'connecting' || callState === 'ending') return false;
    setBusy(true);
    try {
      await synchronizeProduct();
      if (resources.current.conversationId !== id) return false;
      await adapter.text(id, text);
      return true;
    } catch {
      setError('error');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function ask(text: string): Promise<boolean> {
    if (state === 'connecting') return false;
    if (state === 'idle') await start(true);
    return send(text);
  }
  async function submitMessage() {
    const text = message.trim();
    if (!text) return;
    if (await ask(text)) setMessage((current) => (current.trim() === text ? '' : current));
  }
  async function action(target: Action, confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      const key = actionKeys.current.get(target.action_id) ?? crypto.randomUUID();
      actionKeys.current.set(target.action_id, key);
      const result = confirm
        ? await adapter.confirm(target.action_id, key)
        : await adapter.cancel(target.action_id);
      setCards((previous) => upsertTimed(previous, { kind: 'action', action: result.action }, tick()));
      window.dispatchEvent(new Event('huspee:cart-changed'));
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  }
  async function edit(target: Action, change: { quantity: number; model_id: number; line_index?: number }) {
    setBusy(true);
    try {
      const result = await adapter.edit(target.action_id, change);
      setCards((previous) => upsertTimed(previous, { kind: 'action', action: result.action }, tick()));
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  }
  function holdMicrophone(enabled: boolean) {
    setMicrophoneEnabled(resources.current.stream, enabled);
    setHoldingToTalk(enabled);
  }
  function toggleCall() {
    setTyping(false);
    if (state === 'idle') void start(false);
    else if (callState === 'idle') void startCall();
    else void endCall();
  }
  function showTyping() {
    setTyping(true);
    window.requestAnimationFrame(() => input.current?.focus());
  }

  const shopName = profile?.shop_name ?? t('open');
  const greeting = (lang === 'en' ? profile?.greeting.en : profile?.greeting.vi) || t('greetingFallback');
  const voiceActive = callState === 'active';
  const checking = tools.some((tool) => tool.status === 'running');
  const awaiting = awaitingConfirmation(cards, now);
  const failure = failureOf(error);
  const connected = profile?.connected !== false;
  const status = panelStatus({
    connected,
    session: state,
    call: callState,
    checking,
    speaking,
    muted,
    pushToTalk,
    holding: holdingToTalk,
    awaiting,
    failure,
  });
  const caption =
    callState === 'connecting'
      ? t('calling')
      : callState !== 'active'
        ? t('captionTap')
        : speaking
          ? t('captionSpeaking')
          : awaiting === 'yes'
            ? t('captionYes')
            : t('captionListening');
  const timeline = buildTimeline(entries, cards, tools);
  const canChat = session.status === 'authenticated';
  const buyer = session.status !== 'authenticated' || !!session.user?.roles.includes('buyer');
  const startFailed =
    state === 'idle' && (failure === 'busy' || failure === 'unavailable') && entries.length === 0 && cards.length === 0;
  const suggestions = order
    ? [t('suggestOrderStatus', { sn: order.order_sn }), t('suggestOrderReturn', { sn: order.order_sn }), t('suggestShipping')]
    : product
      ? [t('suggestProductStock'), t('suggestShopVouchers'), t('suggestShipping'), t('suggestReturnPolicy')]
      : [t('suggestShopVouchers'), t('suggestShopBest'), t('suggestShipping'), t('suggestMyOrder')];
  const showSuggestions = canChat && view === 'chat' && state !== 'connecting' && !busy && !checking && !awaiting;
  const subject = product
    ? { name: product.name, detail: product.variant }
    : order
      ? { name: t('viewingOrder', { sn: order.order_sn }) }
      : undefined;
  const live = state !== 'idle';
  const showChat = session.status !== 'anonymous' && buyer && !(profile?.connected === false && state === 'idle');

  const body =
    session.status === 'anonymous' ? (
      <div className="flex flex-1 flex-col items-center gap-4 px-6 pt-10 text-center">
        <p className="text-sm text-ink">{t('signIn')}</p>
        <Link
          className="flex min-h-10 items-center rounded-sm bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover"
          href={`/login?next=${encodeURIComponent(pathname)}`}
        >
          {t('login')}
        </Link>
      </div>
    ) : !buyer ? (
      <p className="flex flex-1 justify-center px-6 pt-10 text-center text-sm text-muted">{t('buyerOnly')}</p>
    ) : !showChat ? (
      <StateBlock icon={<ClockGlyph className="h-6 w-6" />} title={t('notConnectedTitle')} />
    ) : view === 'history' ? (
      <div className="assistant-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
        <HistoryView
          list={historyList}
          failed={historyError}
          viewing={viewing}
          liveId={liveId}
          live={live}
          canContinue={canChat && state === 'idle'}
          getOptions={adapter.options}
          onRetry={() => void openHistory()}
          onOpen={(id) => void openConversation(id)}
          onBack={() => setViewing(null)}
          onContinue={continueConversation}
        />
      </div>
    ) : startFailed ? (
      <StateBlock icon={<ClockGlyph className="h-6 w-6" />} title={failure === 'busy' ? t('busyTitle') : t('unavailableTitle')}>
        <button
          type="button"
          onClick={() => void start(lastStartTextOnly.current)}
          className="min-h-11 flex-1 rounded-sm bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
        >
          {t('retry')}
        </button>
      </StateBlock>
    ) : (
      <>
        {!contextDismissed && (product || order || page) && (
          <ContextRow
            product={product}
            order={order}
            shopName={shopName}
            logo={logo}
            updating={state === 'active' && !!product && appliedItemId !== product.item_id}
            onRemove={contextKey ? () => setDismissed(contextKey) : undefined}
          />
        )}
        {state === 'active' && <ConversationProducts products={contextProducts} />}
        <div
          ref={scrollArea}
          onScroll={(event) => {
            const area = event.currentTarget;
            followConversation.current = area.scrollHeight - area.scrollTop - area.clientHeight < 48;
          }}
          className="assistant-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-3.5 text-sm *:shrink-0"
          data-testid="chat-transcript"
          aria-live="polite"
        >
          <AssistantBubble text={greeting} />
          {earlier && (
            <>
              <p className="text-center text-[11px] text-subtle">
                {t('earlier')} · {formatDateTime(earlier.started_at, lang)}
              </p>
              <PastConversation detail={earlier} getOptions={adapter.options} />
              <hr className="border-line" />
            </>
          )}
          {timeline.map((item) =>
            item.kind === 'entry' ? (
              item.entry.role === 'user' ? (
                <UserBubble
                  key={`e-${item.entry.id}`}
                  text={item.entry.text}
                  at={item.entry.createdAt}
                  voice={item.entry.id.startsWith('call-')}
                  final={item.entry.final}
                />
              ) : (
                <AssistantBubble
                  key={`e-${item.entry.id}`}
                  text={item.entry.text}
                  speaking={!item.entry.final && speaking}
                  cutOff={item.entry.cutOff}
                />
              )
            ) : item.kind === 'tool' ? (
              <ToolLine key={`t-${item.tool.id}`} tool={item.tool} />
            ) : (
              <AssistantCard
                key={`c-${item.index}`}
                card={item.card}
                checkedAt={item.at}
                spoken={voiceActive}
                pending={busy}
                onAction={(target, confirm) => void action(target, confirm)}
                getOptions={adapter.options}
                onEdit={edit}
              />
            ),
          )}
          {(failure === 'microphone' || failure === 'secureContext') && (
            <StateBlock framed tone="alert" icon={<MicOffGlyph className="h-6 w-6" />} title={t('micBlockedTitle')}>
              <button
                type="button"
                onClick={() => void (state === 'idle' ? start(false) : startCall())}
                className="min-h-10 flex-1 rounded-sm border border-primary text-sm text-primary hover:bg-primary-soft"
              >
                {t('retry')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  showTyping();
                }}
                className="min-h-10 flex-1 rounded-sm bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {t('typeInstead')}
              </button>
            </StateBlock>
          )}
          {failure === 'secureContext' && <p className="text-xs text-muted">{t('secureContext')}</p>}
          {error && failure !== 'microphone' && failure !== 'secureContext' && (
            <p role="alert" className="rounded-sm bg-primary-soft px-3 py-2 text-[13px] text-ink">
              {t(error === 'busy' ? 'busyTitle' : error === 'unavailable' ? 'unavailableTitle' : error)}
            </p>
          )}
          {showSuggestions && (
            <div className="assistant-suggestions flex flex-wrap gap-1.5 pt-1">
              {suggestions.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => void ask(text)}
                  className="min-h-8 rounded-full border border-line-strong bg-white px-3 text-[13px] text-ink hover:border-primary hover:text-primary"
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>
        <PanelFooter
          typing={typing}
          call={callState}
          micDisabled={!canChat || state === 'connecting' || busy}
          onMic={toggleCall}
          caption={caption}
          onType={showTyping}
          live={live}
          onEnd={() => (live ? cleanup(true) : onSheetChange(false))}
          message={message}
          onMessage={setMessage}
          onSubmit={() => void submitMessage()}
          sendDisabled={!canChat || busy || !message.trim() || state === 'connecting' || callState === 'connecting' || callState === 'ending'}
          inputRef={input}
          callControls={
            microphone && (voiceActive || callState === 'connecting') ? (
              <CallControls
                stream={microphone.stream}
                analyser={microphone.analyser}
                audioContext={microphone.audioContext}
                muted={muted}
                pushToTalk={pushToTalk}
                onMute={() => {
                  const next = !muted;
                  setMicrophoneEnabled(resources.current.stream, !next);
                  setMuted(next);
                }}
                onHold={holdMicrophone}
                onPushToTalk={() => {
                  const next = !pushToTalk;
                  setMicrophoneEnabled(resources.current.stream, !next && !muted);
                  setHoldingToTalk(false);
                  setPushToTalk(next);
                }}
              />
            ) : undefined
          }
        />
      </>
    );

  return visible && portalTarget
    ? createPortal(
        <div ref={dock} className={`assistant-dock ${sheet ? 'assistant-dock-open' : ''}`}>
          {!pinned && <PanelRail shopName={shopName} live={live} onOpen={() => onPinnedChange(true)} />}
          <LauncherBar buttonRef={launcher} hidden={sheet} subject={subject} live={live} onOpen={() => onSheetChange(true)} />
          {sheet && <div aria-hidden="true" className="assistant-scrim lg:hidden" onClick={() => onSheetChange(false)} />}
          <section
            ref={panel}
            tabIndex={-1}
            role={phone && sheet ? 'dialog' : 'complementary'}
            aria-modal={phone && sheet ? true : undefined}
            aria-label={t('title', { shop: shopName })}
            className={`assistant-panel flex-col bg-white text-ink outline-none ${pinned ? 'lg:flex' : 'lg:hidden'} ${sheet ? 'max-lg:flex' : 'max-lg:hidden'}`}
          >
            <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-gray-300 lg:hidden" />
            <PanelHeader
              shopName={shopName}
              logo={logo}
              status={status}
              historyAvailable={canChat}
              historyOpen={view === 'history'}
              onHistory={() => (view === 'history' ? setView('chat') : void openHistory())}
              onCollapse={() => onPinnedChange(false)}
              onMinimize={() => onSheetChange(false)}
            />
            {body}
          </section>
        </div>,
        portalTarget,
      )
    : null;
}
