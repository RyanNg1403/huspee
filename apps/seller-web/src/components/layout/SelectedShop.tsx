'use client';
import { createContext, useContext } from 'react';
import type { SellerShop } from '@huspee/sdk';
type ShopContext = {
  shops: SellerShop[];
  selectedShopId: number | null;
  setSelectedShopId: (id: number | null) => void;
  loading: boolean;
  error: boolean;
  refresh: () => void;
};
export const Context = createContext<ShopContext | null>(null);
export function useSelectedShop() {
  const value = useContext(Context);
  if (!value) throw new Error('SellerShell required');
  return value;
}
