export type Failure = 'microphone' | 'secureContext' | 'busy' | 'unavailable';
export type StatusIndicator = 'ready' | 'live' | 'off' | 'error' | 'spinner' | 'bars' | 'none';
/** Message keys (assistant messages) for the status line. */
export type StatusKey =
  | 'notConnected'
  | 'connecting'
  | 'busy'
  | 'unavailable'
  | 'calling'
  | 'checking'
  | 'speaking'
  | 'awaitingTap'
  | 'awaitingYesVoice'
  | 'awaitingYesText'
  | 'micBlocked'
  | 'listening'
  | 'holdToTalk'
  | 'muted'
  | 'statusReady';
export type PanelStatus = { key: StatusKey; indicator: StatusIndicator };

/** The one-line status under the assistant's name, from the session's own state. */
export function panelStatus(input: {
  connected: boolean;
  session: 'idle' | 'connecting' | 'active';
  call: 'idle' | 'connecting' | 'active' | 'ending';
  checking: boolean;
  speaking: boolean;
  muted: boolean;
  pushToTalk: boolean;
  holding: boolean;
  awaiting?: 'tap' | 'yes';
  failure?: Failure;
}): PanelStatus {
  if (!input.connected) return { key: 'notConnected', indicator: 'off' };
  if (input.session === 'connecting') return { key: 'connecting', indicator: 'spinner' };
  if (input.session === 'idle' && (input.failure === 'busy' || input.failure === 'unavailable'))
    return { key: input.failure, indicator: 'off' };
  if (input.call === 'connecting') return { key: 'calling', indicator: 'spinner' };
  if (input.checking) return { key: 'checking', indicator: 'spinner' };
  if (input.speaking) return { key: 'speaking', indicator: 'bars' };
  if (input.awaiting === 'tap') return { key: 'awaitingTap', indicator: 'none' };
  if (input.awaiting === 'yes')
    return { key: input.call === 'active' ? 'awaitingYesVoice' : 'awaitingYesText', indicator: 'live' };
  if (input.call !== 'active' && (input.failure === 'microphone' || input.failure === 'secureContext'))
    return { key: 'micBlocked', indicator: 'error' };
  if (input.call === 'active') {
    if (input.pushToTalk) return input.holding ? { key: 'listening', indicator: 'live' } : { key: 'holdToTalk', indicator: 'off' };
    return input.muted ? { key: 'muted', indicator: 'off' } : { key: 'listening', indicator: 'live' };
  }
  return { key: 'statusReady', indicator: 'ready' };
}

export function failureOf(error: string): Failure | undefined {
  return error === 'microphone' || error === 'secureContext' || error === 'busy' || error === 'unavailable'
    ? error
    : undefined;
}
