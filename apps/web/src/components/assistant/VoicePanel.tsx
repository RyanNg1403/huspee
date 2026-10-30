'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang, useT } from '@/i18n';
import { useSession } from '@/components/session';
import { AssistantCard, type Action, type Card, type EditOptions } from './cards';
import { messages } from './messages';
import { upsertCard } from './card-state';
import { InterruptionDetector } from './interruption';
import { setMicrophoneEnabled } from './microphone';
import { SpeechPlayer, type SpeechItem } from './speech-player';
import {
  appendFinalTranscript,
  applyChannelEvent,
  type ChannelEvent,
  type TranscriptEntry,
} from './transcript';

type LiveEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean; item_id?: string }
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'card'; card: Card }
  | ({ type: 'speak' } & SpeechItem)
  | { type: 'action'; action: Action }
  | { type: 'closed'; reason: string | null }
  | { type: 'error'; message: string };
type Adapter = {
  start: (input: {
    shop_id: number;
    sdp_offer: string;
    lang: string;
  }) => Promise<{ conversation_id: string; sdp_answer: string; voice_output?: 'checked' | 'codex' }>;
  startText: (input: { shop_id: number; lang: string }) => Promise<{ conversation_id: string }>;
  text: (id: string, text: string) => Promise<unknown>;
  stop: (id: string) => Promise<unknown>;
  eventsUrl: (id: string) => string;
  confirm: (id: string, key: string) => Promise<{ action: Action }>;
  options: (id: string) => Promise<EditOptions>;
  edit: (
    id: string,
    input: { quantity: number; model_id: number; line_index?: number },
  ) => Promise<{ action: Action }>;
  cancel: (id: string) => Promise<{ action: Action }>;
};

export function VoicePanel({ shopId, adapter }: { shopId: number; adapter: Adapter }) {
  const t = useT(messages);
  const pathname = usePathname();
  const { lang } = useLang();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const resources = useRef<{
    pc?: RTCPeerConnection;
    stream?: MediaStream;
    events?: EventSource;
    conversationId?: string;
    audio?: HTMLAudioElement;
    audioContext?: AudioContext;
    analyserTimer?: number;
  }>({});
  const scrollArea = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const sequence = useRef(0);
  const channelOpened = useRef(false);
  // Checked output: the server sends only verified assistant text; the voice model's own text is never shown or played.
  const checkedMode = useRef(false);
  const player = useRef<SpeechPlayer | undefined>(undefined);
  const actionKeys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const stopRef = useRef(adapter.stop);
  stopRef.current = adapter.stop;
  function cleanup(sendStop: boolean) {
    generation.current++;
    const current = resources.current;
    resources.current = {};
    player.current?.stop();
    player.current = undefined;
    if (current.analyserTimer !== undefined) window.clearInterval(current.analyserTimer);
    void current.audioContext?.close().catch(() => undefined);
    current.events?.close();
    current.pc?.close();
    current.stream?.getTracks().forEach((track) => track.stop());
    if (current.audio) {
      current.audio.pause();
      current.audio.srcObject = null;
    }
    if (sendStop && current.conversationId)
      void stopRef.current(current.conversationId).catch(() => undefined);
    setChecking(false);
    setState('idle');
  }
  useEffect(() => {
    const area = scrollArea.current;
    if (area && followConversation.current) area.scrollTop = area.scrollHeight;
  }, [entries, cards, checking]);
  useEffect(
    () => () => {
      generation.current++;
      const current = resources.current;
      player.current?.stop();
      if (current.analyserTimer !== undefined) window.clearInterval(current.analyserTimer);
      void current.audioContext?.close().catch(() => undefined);
      current.events?.close();
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
    if (
      event.type === 'transcript' &&
      (!channelOpened.current || (checkedMode.current && event.role === 'assistant'))
    ) {
      const id = sequence.current++;
      setEntries((previous) => appendFinalTranscript(previous, event, id));
    }
    if (event.type === 'speak') player.current?.enqueue(event);
    if (event.type === 'tool') setChecking(event.status === 'started');
    if (event.type === 'card') setCards((previous) => upsertCard(previous, event.card));
    if (event.type === 'action')
      setCards((previous) => upsertCard(previous, { kind: 'action', action: event.action }));
    if (event.type === 'closed') cleanup(false);
    if (event.type === 'error') setError(t('error'));
  }
  function connectEvents(id: string) {
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
  async function start(textOnly = false) {
    followConversation.current = true;
    setError('');
    setState('connecting');
    setEntries([]);
    channelOpened.current = false;
    checkedMode.current = false;
    setCards([]);
    const token = ++generation.current;
    try {
      if (textOnly) {
        const result = await adapter.startText({ shop_id: shopId, lang });
        if (generation.current !== token) {
          void adapter.stop(result.conversation_id).catch(() => undefined);
          return;
        }
        resources.current.conversationId = result.conversation_id;
        connectEvents(result.conversation_id);
        setState('active');
        return;
      }
      if (!window.RTCPeerConnection) throw new Error('microphone');
      let stream: MediaStream | undefined;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new Error('microphone');
      }
      if (generation.current !== token) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = stream;
      const pc = new RTCPeerConnection();
      resources.current.pc = pc;
      pc.onconnectionstatechange = () => {
        if (
          generation.current === token &&
          (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
        ) {
          setError(t('unavailable'));
          cleanup(true);
        }
      };
      if (stream) pc.addTrack(stream.getAudioTracks()[0], stream);
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      let assistantPlaying = false;
      let speechStart: number | undefined;
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
        if (generation.current !== token) {
          void context.close().catch(() => undefined);
          return;
        }
        player.current = new SpeechPlayer(context);
        const detector = new InterruptionDetector();
        const rms = (analyser: AnalyserNode | undefined) => {
          if (!analyser) return 0;
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        };
        resources.current.analyserTimer = window.setInterval(() => {
          const output = checkedMode.current ? player.current?.analyser : remoteAnalyser;
          if (!output) return;
          const remote = rms(output);
          const playing = checkedMode.current ? !!player.current?.speaking : assistantPlaying;
          const detected = detector.sample(Date.now(), rms(micAnalyser), remote, playing || remote > 0.01);
          if (detected !== undefined) {
            speechStart = detected;
            if (checkedMode.current) player.current?.stop();
          }
        }, 50);
      } catch {
        void context?.close().catch(() => undefined);
        context = undefined;
      }
      const channel = pc.createDataChannel('oai-events');
      channel.onopen = () => {
        if (generation.current !== token) return;
        channelOpened.current = true;
        setEntries([]);
      };
      channel.onmessage = (event) => {
        if (generation.current !== token || typeof event.data !== 'string') return;
        try {
          const payload = JSON.parse(event.data) as ChannelEvent;
          const now = Date.now();
          const role = 'turn' in payload ? (payload.turn as { role?: string } | undefined)?.role : undefined;
          if (checkedMode.current) {
            // Only the buyer's turns come from the channel; a new buyer turn interrupts playback.
            if (role !== 'user' && payload.type !== 'turn.delta') return;
            if (payload.type === 'turn.created') player.current?.stop();
          }
          if (
            (payload.type === 'turn.created' || payload.type === 'turn.done') &&
            (payload.turn as { role?: string } | undefined)?.role === 'assistant'
          ) {
            assistantPlaying = payload.type === 'turn.created';
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
      const audio = new Audio();
      audio.autoplay = true;
      resources.current.audio = audio;
      pc.ontrack = (event) => {
        // Checked output: the realtime model's own audio is never played; only checked speech is.
        if (checkedMode.current) return;
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
      const result = await adapter.start({
        shop_id: shopId,
        sdp_offer: pc.localDescription?.sdp ?? '',
        lang,
      });
      if (generation.current !== token) {
        void adapter.stop(result.conversation_id).catch(() => undefined);
        return;
      }
      resources.current.conversationId = result.conversation_id;
      checkedMode.current = result.voice_output === 'checked';
      await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp_answer });
      connectEvents(result.conversation_id);
      setMuted(false);
      setPushToTalk(false);
      setState('active');
    } catch (e) {
      if (generation.current !== token) return;
      const code = typeof e === 'object' && e && 'code' in e ? String(e.code).toLowerCase() : '';
      const microphone =
        (e instanceof DOMException &&
          ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) ||
        (e instanceof Error && e.message === 'microphone');
      setError(microphone ? t('microphone') : code === 'assistant_busy' ? t('busy') : t('unavailable'));
      cleanup(true);
    }
  }
  async function send() {
    const text = message.trim();
    const id = resources.current.conversationId;
    if (!text || !id || busy) return;
    setBusy(true);
    try {
      await adapter.text(id, text);
      setMessage('');
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
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
      setCards((previous) => upsertCard(previous, { kind: 'action', action: result.action }));
      window.dispatchEvent(new Event('huspee:cart-changed'));
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <section
          className="mb-2 flex h-[min(70vh,38rem)] w-[min(calc(100vw-2rem),24rem)] flex-col rounded-lg border bg-white shadow-xl"
          aria-label={t('open')}
        >
          <header className="flex items-center justify-between bg-[#ee4d2d] p-3 text-white">
            <strong>{t('open')}</strong>
            <button
              onClick={() => {
                cleanup(true);
                setOpen(false);
              }}
              aria-label={t('close')}
            >
              ✕
            </button>
          </header>
          {session.status === 'anonymous' ? (
            <div className="p-4">
              <p>{t('signIn')}</p>
              <Link className="text-[#ee4d2d]" href={`/login?next=${encodeURIComponent(pathname)}`}>
                {t('login')}
              </Link>
            </div>
          ) : session.status === 'authenticated' && !session.user?.roles.includes('buyer') ? (
            <p className="p-4">{t('buyerOnly')}</p>
          ) : (
            <>
              <div
                ref={scrollArea}
                onScroll={(event) => {
                  const area = event.currentTarget;
                  followConversation.current = area.scrollHeight - area.scrollTop - area.clientHeight < 48;
                }}
                className="flex-1 space-y-3 overflow-y-auto p-3"
                aria-live="polite"
              >
                {entries.map((entry) => (
                  <p
                    key={entry.id}
                    className={`rounded p-2 text-sm whitespace-pre-wrap ${entry.role === 'user' ? 'bg-orange-50' : 'bg-gray-100'}`}
                  >
                    {entry.text}
                    {entry.cutOff && <span className="text-gray-500"> ({t('cutOff')})</span>}
                  </p>
                ))}
                {checking && <p className="text-sm text-gray-500">{t('checking')}</p>}
                {cards.map((card, index) => (
                  <AssistantCard
                    key={index}
                    card={card}
                    pending={busy}
                    onAction={(item, confirm) => void action(item, confirm)}
                    getOptions={adapter.options}
                    onEdit={async (item, input) => {
                      setBusy(true);
                      try {
                        const result = await adapter.edit(item.action_id, input);
                        setCards((previous) =>
                          upsertCard(previous, { kind: 'action', action: result.action }),
                        );
                      } catch {
                        setError(t('error'));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ))}
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>
              <div className="space-y-2 border-t p-3">
                {state === 'idle' && (
                  <>
                    <button
                      className="rounded bg-[#ee4d2d] px-3 py-2 text-white"
                      disabled={session.status !== 'authenticated'}
                      onClick={() => void start()}
                    >
                      {t('start')}
                    </button>
                    <button
                      className="ml-2 rounded border px-3 py-2"
                      disabled={session.status !== 'authenticated'}
                      onClick={() => void start(true)}
                    >
                      {t('type')}
                    </button>
                  </>
                )}
                {state === 'connecting' && <p>{t('connecting')}</p>}
                {state === 'active' && (
                  <>
                    <div className="flex gap-2">
                      {resources.current.stream && (
                        <button
                          className="rounded border px-3 py-2"
                          aria-pressed={pushToTalk}
                          onClick={() => {
                            const next = !pushToTalk;
                            setMicrophoneEnabled(resources.current.stream, !next && !muted);
                            setPushToTalk(next);
                          }}
                        >
                          {t('pushToTalk')}
                        </button>
                      )}
                      {resources.current.stream && pushToTalk && (
                        <button
                          className="rounded border px-3 py-2"
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
                          {t('holdToTalk')}
                        </button>
                      )}
                      {resources.current.stream && !pushToTalk && (
                        <button
                          className="rounded border px-3 py-2"
                          onClick={() => {
                            const next = !muted;
                            setMicrophoneEnabled(resources.current.stream, !next);
                            setMuted(next);
                          }}
                        >
                          {muted ? t('unmute') : t('mute')}
                        </button>
                      )}
                      <button className="rounded border px-3 py-2" onClick={() => cleanup(true)}>
                        {t('stop')}
                      </button>
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      <input
                        className="min-w-0 flex-1 rounded border p-2"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={t('placeholder')}
                        aria-label={t('placeholder')}
                      />
                      <button
                        disabled={busy || !message.trim()}
                        className="rounded bg-[#ee4d2d] px-3 py-2 text-white disabled:opacity-50"
                      >
                        {t('send')}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}
      <button
        className="ml-auto block rounded-full bg-[#ee4d2d] px-4 py-3 text-white shadow-lg"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('open')}
      >
        🎙 {t('open')}
      </button>
    </div>
  );
}
