'use client';
import type { ReactNode } from 'react';
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="p-8 text-center text-gray-500">
      <p>{title}</p>
      {children}
    </div>
  );
}
