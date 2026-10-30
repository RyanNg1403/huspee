import Link from 'next/link';
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Huspee home"
      className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
        <svg width="20" height="22" viewBox="0 0 36 40" fill="none" aria-hidden="true">
          <path d="M5 12h26l2 25H3L5 12Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
          <path
            d="M12 14V9a6 6 0 0 1 12 0v5M12 20v10m12-10v10m-12-5h12"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>Huspee</span>
    </Link>
  );
}
