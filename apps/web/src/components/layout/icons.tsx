import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Stroke icons the shared icon set does not have yet. */
function Stroke({ children, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BagLogoIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4.5 8h15l-1.2 12.2a1 1 0 0 1-1 .8H6.7a1 1 0 0 1-1-.8z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      <path d="M9.5 12v5M14.5 12v5M9.5 14.5h5" />
    </Stroke>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Stroke>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Stroke>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2} {...props}>
      <path d="m15 6-6 6 6 6" />
    </Stroke>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2} {...props}>
      <path d="m9 6 6 6-6 6" />
    </Stroke>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </Stroke>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Stroke>
  );
}

export function ClearIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" className="stroke-white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SortIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2} {...props}>
      <path d="m8 9 4-4 4 4" />
      <path d="m8 15 4 4 4-4" />
    </Stroke>
  );
}
