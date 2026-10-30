'use client';

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item) => (
        <button
          role="tab"
          aria-selected={item.value === value}
          className={`-mb-px border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition ${item.value === value ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          key={item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
