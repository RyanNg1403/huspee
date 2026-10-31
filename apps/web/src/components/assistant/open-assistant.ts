/**
 * Any page control can open the shop assistant (pinned panel on wide screens, sheet on phones). The
 * event is cancelable: the assistant calls preventDefault() when it handled it, so a page can tell
 * whether an assistant is there.
 */
export const OPEN_ASSISTANT_EVENT = 'huspee:assistant-open';

/** Returns true when an assistant on this page opened. */
export function openAssistant(): boolean {
  return !window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { cancelable: true }));
}
