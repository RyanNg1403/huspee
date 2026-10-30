'use client';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  const variantClass =
    variant === 'primary'
      ? 'bg-primary text-white'
      : variant === 'outline'
        ? 'border border-primary text-primary'
        : 'text-gray-700';
  const sizeClass = size === 'sm' ? 'px-3 py-1' : size === 'lg' ? 'px-6 py-3' : 'px-4 py-2';
  const baseClass = 'inline-flex items-center justify-center gap-2 rounded font-medium disabled:opacity-50';
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
