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
    <div role="tablist" className="flex gap-4 border-b">
      {items.map((item) => (
        <button
          role="tab"
          aria-selected={item.value === value}
          className={`border-b-2 px-2 py-3 ${item.value === value ? 'border-primary text-primary' : 'border-transparent'}`}
          key={item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
