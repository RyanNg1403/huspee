'use client';
import type { SelectHTMLAttributes } from 'react';
import { field } from '@huspee/web-ui/components/ui/field';
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${field} ${props.className ?? ''}`} />;
}
