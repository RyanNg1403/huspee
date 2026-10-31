const PATHS = {
  home: ['M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  orders: [
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  ],
  products: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
  marketing: [
    'M3 9a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-1.5a1.5 1.5 0 0 0 0-3z',
  ],
  assistant: ['M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z', 'M5 11a7 7 0 0 0 14 0M12 18v3'],
  shop: ['M3 9 4.5 4h15L21 9M3 9v1a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M3 9h18M5 13v7h14v-7'],
  chevron: ['m6 9 6 6 6-6'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  check: ['M20 6 9 17l-5-5'],
  wrench: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  ],
} as const;

type ShellIconName = keyof typeof PATHS;

/** Decorative stroke icon for the Seller Centre chrome; inherits the text colour. */
export function ShellIcon({
  name,
  className = 'h-[18px] w-[18px]',
  strokeWidth = 1.7,
}: {
  name: ShellIconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
