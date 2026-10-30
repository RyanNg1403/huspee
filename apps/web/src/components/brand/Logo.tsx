import Link from 'next/link';
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Huspee home"
      className={`inline-flex items-center gap-2 font-bold ${className}`}
    >
      <svg width="36" height="40" viewBox="0 0 36 40" fill="none" aria-hidden="true">
        <path d="M5 12h26l2 25H3L5 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path
          d="M12 14V9a6 6 0 0 1 12 0v5M12 20v10m12-10v10m-12-5h12"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span>Huspee</span>
    </Link>
  );
}
