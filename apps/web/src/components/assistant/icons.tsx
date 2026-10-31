import type { SVGProps } from 'react';

type GlyphProps = SVGProps<SVGSVGElement>;
function Glyph({ children, strokeWidth = 2, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MicGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Glyph>
  );
}
export function MicOffGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 4.9 2.3M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11 5.7M12 18v3M3 3l18 18" />
    </Glyph>
  );
}
export function ClockGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Glyph>
  );
}
export function KeyboardGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={1.7} {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </Glyph>
  );
}
export function SendGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </Glyph>
  );
}
export function ChevronGlyph({ direction, ...props }: GlyphProps & { direction: 'up' | 'down' | 'right' | 'left' }) {
  const d = { up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6' }[direction];
  return (
    <Glyph {...props}>
      <path d={d} />
    </Glyph>
  );
}
export function CloseGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.2} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Glyph>
  );
}
export function CheckGlyph(props: GlyphProps) {
  return (
    <Glyph strokeWidth={2.4} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}
export function PauseGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9 6v12M15 6v12" />
    </Glyph>
  );
}

/** Spinning ring for work in progress. */
export function Spinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-muted ${className}`}
    />
  );
}

/** Four bars that move while the assistant is speaking. */
export function SpeakingBars({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex h-2.5 items-end gap-[2px] ${className}`}>
      {[40, 100, 70, 90].map((height, index) => (
        <span
          key={index}
          className="w-[2px] animate-pulse bg-primary motion-reduce:animate-none"
          style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}
