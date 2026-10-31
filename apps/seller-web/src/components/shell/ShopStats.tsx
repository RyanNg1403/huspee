'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { SalesSummary } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useSelectedShop } from '@/components/layout/SelectedShop';

/** Events other Seller Centre pages dispatch on `window` after changing orders or tickets. */
export const STATS_EVENTS = ['huspee:inbox-changed', 'huspee:orders-changed'] as const;

type Stats = {
  /** Order, return and stock totals across the shop's whole history. */
  summary: SalesSummary | null;
  /** Buyer questions waiting for the shop's reply. */
  openTickets: number | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
};
type Loaded = {
  shopId: number | null;
  summary: SalesSummary | null;
  openTickets: number | null;
  error: unknown;
};

const StatsContext = createContext<Stats | null>(null);
const EMPTY: Loaded = { shopId: null, summary: null, openTickets: null, error: null };

export function ShopStatsProvider({ children }: { children: ReactNode }) {
  const { selectedShopId: shopId } = useSelectedShop();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!shopId) return;
    let active = true;
    const load = () => {
      const api = getApiClient().seller;
      Promise.all([
        api.dashboardSummary(shopId, { time_from: 1 }),
        api.inbox.list(shopId, { status: 'OPEN', page_size: 1 }),
      ])
        .then(([summary, inbox]) => {
          if (active) setLoaded({ shopId, summary, openTickets: inbox.page.total, error: null });
        })
        .catch((error: unknown) => {
          if (active) setLoaded({ shopId, summary: null, openTickets: null, error });
        });
    };
    load();
    for (const name of STATS_EVENTS) window.addEventListener(name, load);
    return () => {
      active = false;
      for (const name of STATS_EVENTS) window.removeEventListener(name, load);
    };
    // Counts are refreshed on every navigation so they follow actions taken on other pages.
  }, [shopId, pathname, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // Never show another shop's numbers while the selected shop loads.
  const current = loaded.shopId === shopId ? loaded : EMPTY;
  return (
    <StatsContext.Provider
      value={{
        summary: current.summary,
        openTickets: current.openTickets,
        loading: !!shopId && current.summary === null && !current.error,
        error: current.error,
        reload,
      }}
    >
      {children}
    </StatsContext.Provider>
  );
}

export function useShopStats() {
  const value = useContext(StatsContext);
  if (!value) throw new Error('ShopStatsProvider required');
  return value;
}
