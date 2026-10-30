'use client';
import type { ReactNode } from 'react';
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
}) {
  const colors = {
    neutral: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };
  return <span className={`rounded px-2 py-1 text-xs ${colors[tone]}`}>{children}</span>;
}
