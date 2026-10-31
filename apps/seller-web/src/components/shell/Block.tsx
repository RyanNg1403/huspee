import { useId, type ReactNode } from 'react';

/** Page heading at the top of Seller Centre content (20px/600). */
export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">{children}</h1>
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </div>
  );
}

/** White content block: 4px corners, soft shadow, 18px/600 title, optional note and right-hand link. */
export function Block({
  title,
  note,
  action,
  size = 'lg',
  className = '',
  children,
}: {
  title?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  size?: 'lg' | 'sm';
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={`rounded bg-white shadow-card ${size === 'lg' ? 'px-6 py-5' : 'p-5'} ${className}`}
    >
      {title && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={id} className={`font-semibold ${size === 'lg' ? 'text-lg' : 'text-base'}`}>
            {title}
          </h2>
          {note && <span className="text-[13px] text-muted">{note}</span>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
