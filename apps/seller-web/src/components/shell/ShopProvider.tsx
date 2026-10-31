'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { Context } from '@/components/layout/SelectedShop';

const STORAGE_KEY = 'huspee_seller_shop';

function readSaved(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 0;
  }
}
function save(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* Storage can be blocked; the selection then lasts for this page only. */
  }
}

/** The seller's shops and the shop every Seller Centre page works on. */
export function ShopProvider({ children }: { children: ReactNode }) {
  const [shops, setShops] = useState<SellerShop[]>([]);
  const [selectedShopId, setId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    getApiClient()
      .seller.shops.list()
      .then((list) => {
        if (!active) return;
        setShops(list);
        // Restore only a shop still available to this seller.
        const saved = readSaved();
        const id = list.some((s) => s.shop_id === saved) ? saved : (list[0]?.shop_id ?? null);
        setId(id);
        save(id);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const setSelectedShopId = useCallback((id: number | null) => {
    setId(id);
    save(id);
  }, []);
  const refresh = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  return (
    <Context.Provider value={{ shops, selectedShopId, setSelectedShopId, loading, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
