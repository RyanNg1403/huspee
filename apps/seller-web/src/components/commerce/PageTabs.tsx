'use client';

export type TabItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
  /** Count needs the seller's attention: shown in the accent colour when non-zero. */
  accent?: boolean;
  /** Short accent-coloured note after the label, e.g. "4 trống". */
  note?: string;
};

export function PageTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-line-soft">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`-mb-px h-12 shrink-0 border-b-2 px-3.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 ${
              active
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={item.accent && item.count > 0 ? 'text-primary' : undefined}>
                {' '}
                {item.count}
              </span>
            )}
            {item.note && <span className="ml-1.5 text-primary">{item.note}</span>}
          </button>
        );
      })}
    </div>
  );
}
