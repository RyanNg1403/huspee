'use client';
import { useEffect, useState } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { microphoneLevel } from './microphone-level';

type Status = 'checking' | 'quiet' | 'sound' | 'muted' | 'hold' | 'disconnected' | 'paused' | 'unavailable';
const labels = {
  checking: 'micChecking', quiet: 'micQuiet', sound: 'micSound', muted: 'micMuted',
  hold: 'holdToTalk', disconnected: 'micDisconnected', paused: 'micPaused', unavailable: 'micMeterUnavailable',
} as const;
const emptyBars = () => Array<number>(12).fill(0);

/** Reads the call's existing microphone analyser; never requests or stops a microphone itself. */
export function MicrophoneMeter({ stream, analyser, audioContext, pushToTalk }: {
  stream?: MediaStream;
  analyser?: AnalyserNode;
  audioContext?: AudioContext;
  pushToTalk: boolean;
}) {
  const t = useT(messages);
  const [meter, setMeter] = useState<{ status: Status; level: number; bars: number[] }>({ status: 'checking', level: 0, bars: emptyBars() });
  useEffect(() => {
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    let lastSoundAt = 0;
    const timer = window.setInterval(() => {
      const track = stream?.getAudioTracks()[0];
      let status: Status;
      let level = 0;
      if (!track || track.readyState === 'ended' || track.muted) status = 'disconnected';
      else if (!track.enabled) status = pushToTalk ? 'hold' : 'muted';
      else if (!analyser || !audioContext || audioContext.state === 'closed') status = 'unavailable';
      else if (audioContext.state !== 'running') status = 'paused';
      else {
        try {
          analyser.getFloatTimeDomainData(samples);
          const input = microphoneLevel(samples);
          level = input.level;
          if (input.rms >= 0.004) lastSoundAt = Date.now();
          status = Date.now() - lastSoundAt < 1500 ? 'sound' : 'quiet';
        } catch { status = 'unavailable'; }
      }
      const measuring = status === 'quiet' || status === 'sound';
      if (!measuring) lastSoundAt = 0;
      setMeter((previous) => {
        const nextLevel = measuring ? Math.round(previous.level * 0.35 + level * 0.65) : 0;
        if (status === previous.status && nextLevel === 0 && previous.bars.every((bar) => bar === 0)) return previous;
        return { status, level: nextLevel, bars: measuring ? [...previous.bars.slice(1), nextLevel] : emptyBars() };
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [stream, analyser, audioContext, pushToTalk]);
  const warning = meter.status === 'disconnected' || meter.status === 'unavailable' || meter.status === 'paused';
  return (
    <div className="min-w-0 flex-1" data-testid="microphone-meter" data-state={meter.status}>
      <p className="text-xs font-semibold text-ink">{t('micInput')}</p>
      <div className="mt-1 flex min-h-6 items-center gap-2">
        <div role="meter" aria-label={t('micLevel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter.level} aria-valuetext={t(labels[meter.status])} className="flex h-6 w-16 shrink-0 items-center justify-between">
          {meter.bars.map((level, index) => (
            <span key={index} aria-hidden="true" className={`w-[3px] rounded-full transition-[height] duration-100 motion-reduce:transition-none ${meter.status === 'sound' ? 'bg-emerald-500' : warning ? 'bg-amber-400' : 'bg-gray-300'}`} style={{ height: `${3 + level * 0.21}px` }} />
          ))}
        </div>
        {meter.status === 'paused' ? (
          <button type="button" className="min-h-11 min-w-0 text-left text-xs font-semibold text-primary underline underline-offset-2" onClick={() => { void audioContext?.resume().catch(() => undefined); }}>{t('micEnableMeter')}</button>
        ) : (
          <span role="status" className={`min-w-0 text-[11px] leading-tight ${meter.status === 'sound' ? 'text-emerald-700' : warning ? 'text-amber-700' : 'text-muted'}`}>{t(labels[meter.status])}</span>
        )}
      </div>
    </div>
  );
}
