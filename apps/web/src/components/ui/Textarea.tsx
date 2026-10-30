'use client';
import type { TextareaHTMLAttributes } from 'react';
import { field } from './field';
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} ${props.className ?? ''}`} />;
}
