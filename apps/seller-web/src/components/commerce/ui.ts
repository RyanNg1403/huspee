/** Dense Seller Centre styling shared by the commerce pages (orders, returns, products, vouchers). */
const control =
  'inline-flex items-center justify-center gap-1.5 rounded-[4px] text-sm whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

export const btn = {
  primary: `${control} h-9 bg-primary px-4 text-white hover:bg-primary-hover`,
  outline: `${control} h-9 border border-line-strong bg-white px-4 text-ink hover:bg-gray-50`,
  accent: `${control} h-9 border border-primary bg-white px-4 text-primary hover:bg-primary-soft`,
  primarySm: `${control} h-8 bg-primary px-3 text-[13px] text-white hover:bg-primary-hover`,
  outlineSm: `${control} h-8 border border-line-strong bg-white px-3 text-[13px] text-ink hover:bg-gray-50`,
  accentSm: `${control} h-8 border border-primary bg-white px-3 text-[13px] text-primary hover:bg-primary-soft`,
  dashed: `${control} h-9 border border-dashed border-gray-400 bg-white px-4 text-link hover:border-link`,
  link: 'text-link hover:underline disabled:pointer-events-none disabled:opacity-50',
};

/** Text field without a width; `input` is the full-width default. */
export const field =
  'h-9 rounded-[4px] border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-gray-50 disabled:text-muted aria-[invalid=true]:border-primary';

export const input = `${field} w-full`;

export const textarea =
  'min-h-20 w-full rounded-[4px] border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-gray-50 aria-[invalid=true]:border-primary';

export const panel = 'rounded-[4px] bg-white shadow-card';

export const table = {
  root: 'w-full border-collapse text-sm',
  th: 'border-b border-line-soft px-3 py-3 text-left text-[13px] font-medium whitespace-nowrap text-muted first:pl-0 last:pr-0',
  td: 'border-b border-gray-100 px-3 py-3.5 align-top first:pl-0 last:pr-0',
};

export const sub = 'text-[13px] text-muted';
