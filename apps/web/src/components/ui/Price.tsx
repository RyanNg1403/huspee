'use client';
import { formatVnd } from '@/lib/format';
export function Price({ value, originalPrice }: { value: number; originalPrice?: number }) {
  return (
    <span className="font-semibold text-primary tabular-nums">
      {formatVnd(value)}{' '}
      {originalPrice !== undefined && originalPrice > value && (
        <del className="text-sm font-normal text-gray-400">{formatVnd(originalPrice)}</del>
      )}
    </span>
  );
}
