'use client';
import type { TextareaHTMLAttributes } from 'react';
import { field } from '@huspee/web-ui/components/ui/field';
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} ${props.className ?? ''}`} />;
}
