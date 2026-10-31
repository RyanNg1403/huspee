'use client';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { formatClock } from '@huspee/web-ui/components/assistant/time';
import { CheckGlyph, PauseGlyph, SpeakingBars, Spinner } from './icons';
import type { ToolRun } from './timeline';
import { toolLabelKey, toolMakesCard } from './tool-labels';

/** What the buyer said or typed. A voice turn still being transcribed is drawn as a draft. */
export function UserBubble({
  text,
  at,
  voice,
  final = true,
}: {
  text: string;
  at?: number;
  voice: boolean;
  final?: boolean;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  if (!final)
    return (
      <div className="flex max-w-[85%] flex-col items-end gap-0.5 self-end">
        <p className="rounded-2xl rounded-br border border-dashed border-line-strong px-3 py-2 whitespace-pre-wrap text-muted">
          {text || '…'}
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-subtle">
          <SpeakingBars />
          {t('hearing')}
        </span>
      </div>
    );
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-0.5 self-end">
      <p className="rounded-2xl rounded-br bg-primary px-3 py-2 whitespace-pre-wrap text-white">{text}</p>
      {at !== undefined && (
        <span className="text-[11px] text-subtle">
          {t(voice ? 'youSaid' : 'youTyped', { time: formatClock(at, lang) })}
        </span>
      )}
    </div>
  );
}

/** The assistant's own wording; facts it states are only the ones shown in the cards. */
export function AssistantBubble({ text, speaking, cutOff }: { text: string; speaking?: boolean; cutOff?: boolean }) {
  const t = useT(messages);
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-0.5 self-start">
      <p className="rounded-2xl rounded-bl bg-line-soft px-3 py-2 whitespace-pre-wrap text-ink">{text}</p>
      {speaking && (
        <span className="flex items-center gap-1.5 text-[11px] text-subtle">
          <SpeakingBars />
          {t('speaking')}
        </span>
      )}
      {cutOff && (
        <span className="flex items-center gap-1 text-[11px] text-subtle">
          <PauseGlyph className="h-3 w-3" />
          {t('cutOffNote')}
        </span>
      )}
    </div>
  );
}

/** A tool call: spinner while it runs, a tick and a short description once it returns. */
export function ToolLine({ tool }: { tool: ToolRun }) {
  const t = useT(messages);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted" data-tool={tool.name} data-tool-status={tool.status}>
        {tool.status === 'running' ? (
          <Spinner className="h-3 w-3" />
        ) : tool.status === 'done' ? (
          <CheckGlyph className="h-3.5 w-3.5 text-success" />
        ) : (
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-400" />
        )}
        {t(toolLabelKey(tool.name, tool.status))}
      </p>
      {tool.status === 'running' && toolMakesCard(tool.name) && (
        <div aria-hidden="true" className="flex gap-2.5 rounded-lg border border-line p-2.5">
          <span className="h-[60px] w-[60px] shrink-0 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className="h-3 w-4/5 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
            <span className="h-3 w-1/2 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
            <span className="h-3 w-1/3 animate-pulse rounded bg-primary-soft motion-reduce:animate-none" />
          </span>
        </div>
      )}
    </div>
  );
}
