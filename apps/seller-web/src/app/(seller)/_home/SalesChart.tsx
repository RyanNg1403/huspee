'use client';
import { useT } from '@huspee/web-ui/i18n/client';
import { chartPath, niceStep } from './aggregate';
import { homeMessages } from './messages';

const HOURS = 24;
const X_LABELS = [0, 4, 8, 12, 16, 20, 23];

export type ChartSeries = {
  label: string;
  /** Running totals for each elapsed hour of today. */
  today: number[];
  /** Running totals for all 24 hours of yesterday. */
  yesterday: number[];
  integer: boolean;
  format: (value: number) => string;
  axis: (value: number) => string;
};

/** Today's running total against yesterday's, by hour. */
export function SalesChart({ series }: { series: ChartSeries }) {
  const t = useT(homeMessages);
  const step = niceStep(Math.max(0, ...series.today, ...series.yesterday), series.integer);
  const max = step * 4;
  const last = series.today.length - 1;
  const current = series.today[last] ?? 0;
  const summary = t('chartSummary', {
    metric: series.label,
    today: series.format(current),
    yesterday: series.format(series.yesterday[last] ?? 0),
    yesterdayTotal: series.format(series.yesterday[HOURS - 1] ?? 0),
  });
  return (
    <div className="min-w-0 flex-[999_1_380px]">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 bg-primary" />
          {t('today')}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-[#8c8c8c]" />
          {t('yesterday')}
        </span>
        <span className="ml-auto">{t('chartCaption', { metric: series.label })}</span>
      </div>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-2">
        <div aria-hidden="true" className="relative h-[200px] text-[11px] text-muted">
          {[4, 3, 2, 1, 0].map((k) => (
            <span key={k} className="absolute right-0 -translate-y-1/2" style={{ top: `${(4 - k) * 25}%` }}>
              {k ? series.axis(step * k) : 0}
            </span>
          ))}
        </div>
        <div className="relative h-[200px] border-b border-[#d9d9d9]">
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3].map((k) => (
              <span key={k} className="border-t border-[#f0f0f0]" />
            ))}
            <span />
          </div>
          <svg
            role="img"
            aria-label={summary}
            viewBox="0 0 230 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d={chartPath(series.yesterday, max)}
              fill="none"
              stroke="#8c8c8c"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={chartPath(series.today, max)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {last >= 0 && (
            <span
              aria-hidden="true"
              className="absolute -mb-[5px] -ml-[5px] h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_2px_#fff]"
              style={{
                left: `${(last / (HOURS - 1)) * 100}%`,
                bottom: `${max ? (current / max) * 100 : 0}%`,
              }}
            />
          )}
          <div className="absolute inset-0 flex">
            {Array.from({ length: HOURS }, (_, hour) => (
              <span
                key={hour}
                className="flex-1"
                title={t('hourTip', {
                  hour,
                  today: hour <= last ? series.format(series.today[hour]) : t('noValue'),
                  yesterday: series.format(series.yesterday[hour] ?? 0),
                })}
              />
            ))}
          </div>
        </div>
        <span />
        <div aria-hidden="true" className="flex justify-between pt-1 text-[11px] text-muted">
          {X_LABELS.map((h) => (
            <span key={h}>{h}h</span>
          ))}
        </div>
      </div>
    </div>
  );
}
