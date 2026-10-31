'use client';
import type { InputHTMLAttributes } from 'react';
import { field } from '@huspee/web-ui/components/ui/field';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${props.className ?? ''}`} />;
}
