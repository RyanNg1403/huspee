'use client';
import type { ReactNode, RefObject } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { KeyboardGlyph, MicGlyph, MicOffGlyph, SendGlyph, Spinner } from './icons';
import { MicrophoneMeter } from './MicrophoneMeter';

type CallState = 'idle' | 'connecting' | 'active' | 'ending';

/** Starts a call, cancels one being set up, or ends the live one; the transcript stays either way. */
function MicButton({
  call,
  big,
  disabled,
  onClick,
}: {
  call: CallState;
  big: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useT(messages);
  const label = call === 'idle' ? t('call') : call === 'connecting' ? t('cancelCall') : call === 'ending' ? t('endingCall') : t('endCall');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || call === 'ending'}
      aria-label={label}
      title={label}
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover active:scale-95 disabled:opacity-50 ${
        big ? 'h-16 w-16' : 'h-[52px] w-[52px]'
      } ${call === 'active' ? 'shadow-[0_0_0_6px_var(--color-mic-ring)]' : ''}`}
    >
      {call === 'connecting' && (
        <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/30 motion-reduce:animate-none" />
      )}
      <MicGlyph className={big ? 'relative h-[26px] w-[26px]' : 'relative h-[22px] w-[22px]'} />
    </button>
  );
}

/** Live call strip: input level, mute or hold-to-talk, and the push-to-talk switch. */
export function CallControls({
  stream,
  analyser,
  audioContext,
  muted,
  pushToTalk,
  onMute,
  onHold,
  onPushToTalk,
}: {
  stream: MediaStream;
  analyser?: AnalyserNode;
  audioContext?: AudioContext;
  muted: boolean;
  pushToTalk: boolean;
  onMute: () => void;
  onHold: (enabled: boolean) => void;
  onPushToTalk: () => void;
}) {
  const t = useT(messages);
  const round = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-muted transition hover:text-ink';
  return (
    <div className="flex items-center gap-2 border-t border-line-soft px-4 py-2">
      <MicrophoneMeter stream={stream} analyser={analyser} audioContext={audioContext} pushToTalk={pushToTalk} />
      {pushToTalk ? (
        <button
          type="button"
          className={`${round} touch-none border-primary bg-primary-soft text-primary select-none active:bg-primary active:text-white`}
          aria-label={t('holdToTalk')}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onHold(true);
          }}
          onPointerUp={() => onHold(false)}
          onPointerCancel={() => onHold(false)}
          onLostPointerCapture={() => onHold(false)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              onHold(true);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              onHold(false);
            }
          }}
          onBlur={() => onHold(false)}
        >
          <MicGlyph className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          className={`${round} ${muted ? 'border-primary text-primary' : ''}`}
          aria-label={muted ? t('unmute') : t('mute')}
          aria-pressed={muted}
          onClick={onMute}
        >
          {muted ? <MicOffGlyph className="h-5 w-5" /> : <MicGlyph className="h-5 w-5" />}
        </button>
      )}
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={pushToTalk} onChange={onPushToTalk} />
        {t('pushToTalk')}
      </label>
    </div>
  );
}

/**
 * Wide screens and phone typing mode: the mic beside the message box. Phones talking: a big mic in
 * the middle, typing on the left and ending on the right.
 */
export function PanelFooter({
  typing,
  call,
  micDisabled,
  onMic,
  caption,
  onType,
  live,
  onEnd,
  message,
  onMessage,
  onSubmit,
  sendDisabled,
  inputRef,
  callControls,
}: {
  typing: boolean;
  call: CallState;
  micDisabled: boolean;
  onMic: () => void;
  caption: string;
  onType: () => void;
  /** A conversation is running: the end control ends it; otherwise phones get a close control. */
  live: boolean;
  onEnd: () => void;
  message: string;
  onMessage: (value: string) => void;
  onSubmit: () => void;
  sendDisabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  callControls?: ReactNode;
}) {
  const t = useT(messages);
  return (
    <div className="assistant-composer shrink-0 border-t border-line-soft bg-white" data-testid="chat-composer">
      {callControls}
      <form
        className={`${typing ? 'flex' : 'hidden lg:flex'} items-center gap-2.5 px-4 py-3`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <MicButton call={call} big={false} disabled={micDisabled} onClick={onMic} />
        <label className="flex min-w-0 flex-1 items-center rounded-full border border-line-strong pr-1 pl-3.5 focus-within:border-primary">
          <span className="sr-only">{t('messageLabel')}</span>
          <input
            ref={inputRef}
            value={message}
            onChange={(event) => onMessage(event.target.value)}
            placeholder={t('placeholder')}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            disabled={sendDisabled}
            aria-label={t('send')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:bg-gray-100 disabled:text-muted"
          >
            <SendGlyph className="h-4 w-4" />
          </button>
        </label>
      </form>
      {live && (
        <div className={`${typing ? 'flex' : 'hidden lg:flex'} -mt-1.5 justify-end px-4 pb-2`}>
          <button type="button" onClick={onEnd} className="min-h-8 px-2 text-xs text-muted hover:text-ink">
            {t('stop')}
          </button>
        </div>
      )}
      {!typing && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-2.5 pb-4 lg:hidden">
          <button
            type="button"
            onClick={onType}
            aria-label={t('type')}
            className="flex h-11 w-11 items-center justify-center justify-self-start rounded-full border border-line-strong text-muted hover:text-ink"
          >
            <KeyboardGlyph className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <MicButton call={call} big disabled={micDisabled} onClick={onMic} />
            <span className="flex min-h-4 items-center gap-1.5 text-xs text-muted">
              {call === 'connecting' && <Spinner className="h-3 w-3" />}
              {caption}
            </span>
          </div>
          <button type="button" onClick={onEnd} className="h-9 justify-self-end px-3 text-[13px] text-muted hover:text-ink">
            {live ? t('stop') : t('close')}
          </button>
        </div>
      )}
    </div>
  );
}
