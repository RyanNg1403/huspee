'use client';
import type { ReactNode } from 'react';
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}
