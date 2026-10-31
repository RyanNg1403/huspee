'use client';
import type { ReactNode } from 'react';
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M4 7h16l-1.5 11.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 7Z" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      </div>
      <p className="font-medium text-gray-700">{title}</p>
      {children && <div className="text-sm text-gray-500">{children}</div>}
    </div>
  );
}
