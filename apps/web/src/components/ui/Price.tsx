'use client';
import { formatVnd } from '@/lib/format';
export function Price({ value, originalPrice }: { value: number; originalPrice?: number }) {
  return (
    <span className="text-primary">
      {formatVnd(value)}{' '}
      {originalPrice !== undefined && originalPrice > value && (
        <del className="text-sm text-gray-400">{formatVnd(originalPrice)}</del>
      )}
    </span>
  );
}
