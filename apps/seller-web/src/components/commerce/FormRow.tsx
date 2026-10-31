import type { ReactNode } from 'react';

/** Label column on the left, control on the right (Seller Centre form layout). */
export function FormRow({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="grid gap-2 py-2.5 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6">
      <Label htmlFor={htmlFor} className="pt-2 text-sm text-muted">
        {required && (
          <span aria-hidden="true" className="mr-0.5 text-primary">
            *
          </span>
        )}
        {label}
      </Label>
      <div className="min-w-0">
        {children}
        {error && (
          <p role="alert" className="mt-1.5 text-[13px] text-primary-hover">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
