'use client';
import type { PublicVoucher } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { InlineState } from './InlineState';
import { messages } from './messages';
import { VoucherTicket } from './VoucherTicket';

type Vouchers = { data: PublicVoucher[] | null; loading: boolean; error: unknown; reload: () => void };

/** The shop's current vouchers; hidden when the shop has none. */
export function ShopVouchers({ vouchers }: { vouchers: Vouchers }) {
  const t = useT(messages);
  const list = vouchers.data?.filter((v) => v.status !== 'expired') ?? [];
  if (vouchers.data && list.length === 0) return null;
  return (
    <section
      aria-labelledby="shop-vouchers"
      className="bg-white p-3 max-sm:-mx-4 sm:rounded sm:px-5 sm:py-4 sm:shadow-card"
    >
      <h2 id="shop-vouchers" className="mb-2 text-sm font-semibold sm:mb-3 sm:text-base">
        {t('vouchers')}
      </h2>
      <InlineState {...vouchers} retry={vouchers.reload} className="h-16 w-full max-w-80" />
      {list.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {list.map((v) => (
            <VoucherTicket key={v.voucher_code} voucher={v} className="w-64 shrink-0 sm:w-80" />
          ))}
        </div>
      )}
    </section>
  );
}
