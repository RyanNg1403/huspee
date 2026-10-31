'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-gray-200/70 ${className}`} />;
}
