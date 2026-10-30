'use client';
import type { SelectHTMLAttributes } from 'react';
import { field } from './field';
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${field} ${props.className ?? ''}`} />;
}
