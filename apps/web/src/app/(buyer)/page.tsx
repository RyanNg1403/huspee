'use client';
import { useEffect } from 'react';
import {
  CategoryStrip,
  DailyDiscover,
  FeaturedShops,
  Highlights,
  Services,
  useShopOffers,
} from './_browse/home';
import { browsePage } from './_browse/shared';

export default function Home() {
  useEffect(() => {
    document.title = 'Huspee';
  }, []);
  const { shops, offers } = useShopOffers();
  return (
    <div className={`${browsePage} space-y-2 md:space-y-4`}>
      <h1 className="sr-only">Huspee</h1>
      <Highlights shops={shops.data?.data ?? []} offers={offers} />
      <Services />
      <CategoryStrip />
      <FeaturedShops shops={shops} offers={offers} />
      <DailyDiscover />
    </div>
  );
}
