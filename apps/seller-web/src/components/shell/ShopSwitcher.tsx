'use client';
import Link from 'next/link';
import { useT } from '@huspee/web-ui/i18n/client';
import { useSelectedShop } from '@/components/layout/SelectedShop';
import { ShellIcon } from './icons';
import { shellMessages } from './messages';

/** Header shop picker; every page and count follows the selected shop. */
export function ShopSwitcher() {
  const t = useT(shellMessages);
  const { shops, selectedShopId, setSelectedShopId, loading, error, refresh } = useSelectedShop();
  if (loading) return <span className="text-muted">{t('loading')}</span>;
  if (error)
    return (
      <button type="button" onClick={refresh} className="text-link hover:underline">
        {t('shopsFailed')} · {t('retry')}
      </button>
    );
  if (!shops.length)
    return (
      <Link href="/shops/new" className="text-link hover:underline">
        {t('createShop')}
      </Link>
    );
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t('selectShop')}</span>
      <select
        value={selectedShopId ?? ''}
        onChange={(e) => setSelectedShopId(Number(e.target.value))}
        className="max-w-56 cursor-pointer appearance-none truncate rounded bg-transparent py-1.5 pr-6 text-ink field-sizing-content hover:text-primary focus-visible:outline-2"
      >
        {shops.map((s) => (
          <option key={s.shop_id} value={s.shop_id}>
            {s.shop_name}
          </option>
        ))}
      </select>
      <ShellIcon
        name="chevron"
        className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-muted"
        strokeWidth={2}
      />
    </label>
  );
}
