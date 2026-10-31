'use client';

import { useLang, useT } from '@huspee/web-ui/i18n';
import type { ToolEntry } from '../conversation-log';
import { formatClock } from '../time';
import { ToolOutputText, useToolInput, useToolLabel } from './describe';
import { conversationMessages } from './messages';

/** Each tool call: what was asked and what verified data came back. */
export function Lookups({ entries }: { entries: ToolEntry[] }) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const label = useToolLabel();
  const describeInput = useToolInput();
  if (!entries.length) return <p className="py-6 text-muted">{t('noLookups')}</p>;
  return (
    <ol>
      {entries.map((entry) => {
        const input = describeInput(entry);
        return (
          <li key={entry.id} className="border-b border-line-soft py-3 last:border-b-0 last:pb-0">
            <div className="flex justify-between gap-2">
              <strong className="font-semibold">{label(entry.tool)}</strong>
              <span className="text-muted">{formatClock(entry.at, lang)}</span>
            </div>
            <div className="text-xs text-subtle">{entry.tool}</div>
            {input && (
              <div className="mt-1">
                <span className="text-muted">{t('inLabel')}</span> {input}
              </div>
            )}
            <div className={input ? '' : 'mt-1'}>
              <span className="text-muted">{t('outLabel')}</span> <ToolOutputText entry={entry} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
