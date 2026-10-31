'use client';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import type { ShopOffers } from '../offers';

/** Listed shops, then each shop's public vouchers and free-shipping threshold. */
export function useShopOffers() {
  const shops = useApi(() => getApiClient().marketplace.listShops({ page_size: 8 }), []);
  const list = shops.data?.data;
  const key = list?.map((s) => s.shop_id).join(',') ?? '';
  const offers = useApi(async (): Promise<ShopOffers[]> => {
    const api = getApiClient().marketplace;
    // Offers decorate the shop list; a shop whose offers fail to load simply shows none.
    return Promise.all(
      (list ?? []).map(async (shop) => {
        const [vouchers, policies] = await Promise.all([
          api.shopVouchers(shop.shop_id).catch(() => []),
          api.shopPolicies(shop.shop_id).catch(() => null),
        ]);
        return { shop, vouchers, freeShippingMinSpend: policies?.free_shipping_min_spend ?? null };
      }),
    );
  }, [key]);
  return { shops, offers: offers.data ?? [], offersLoading: offers.loading };
}
