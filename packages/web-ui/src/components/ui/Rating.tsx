'use client';

export function Rating({ value }: { value: number }) {
  return (
    <span aria-label={`${value} out of 5`} className="tracking-tight text-amber-400">
      {'★'.repeat(Math.max(0, Math.min(5, Math.round(value))))}
      {'☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(value))))}
    </span>
  );
}
