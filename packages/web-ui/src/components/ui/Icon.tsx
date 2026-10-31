const PATHS = {
  shop: [
    'M4 9.5 5.5 4h13L20 9.5',
    'M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0',
    'M5.5 12v8h13v-8',
    'M10 20v-4.5h4V20',
  ],
  pin: [
    'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z',
    'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  box: ['M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z', 'M3.5 7.5 12 12l8.5-4.5', 'M12 12v9'],
  cart: [
    'M3 4h2l2.2 11h10.6L20 7H6',
    'M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    'M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  ],
  chat: ['M4 5h16v11H9l-5 4V5Z'],
  lock: ['M6 11h12v9H6v-9Z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  bot: ['M5 9h14v10H5V9Z', 'M12 9V5', 'M12 5a1 1 0 1 0 0-2', 'M9 14h.01M15 14h.01', 'M2.5 13v3M21.5 13v3'],
  alert: ['M12 4 2.5 20h19L12 4Z', 'M12 10v4.5', 'M12 17.5h.01'],
  check: ['M5 12.5 10 17.5 19 7'],
  sparkle: [
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
    'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z',
  ],
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2V3Z', 'M9 8h6M9 12h6M9 16h3'],
  bolt: ['M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z'],
  bag: ['M5 8h14l-1 12H6L5 8Z', 'M9 8V6a3 3 0 0 1 6 0v2'],
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative stroke icon; inherits the text colour. */
export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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
