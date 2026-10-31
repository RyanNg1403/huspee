'use client';
import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from '@huspee/web-ui/components/ui/Spinner';
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
      ? 'bg-primary text-white shadow-sm hover:bg-primary-hover'
      : variant === 'outline'
        ? 'border border-line bg-white text-ink hover:border-gray-300 hover:bg-gray-50'
        : 'text-gray-700 hover:bg-gray-100';
  const sizeClass =
    size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm';
  const baseClass =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';
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
