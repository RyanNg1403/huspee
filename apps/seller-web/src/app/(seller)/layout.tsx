import { Suspense } from 'react';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Spinner } from '@huspee/web-ui/components/ui';
import { SellerShell } from '@/components/shell/SellerShell';
import { ShopProvider } from '@/components/shell/ShopProvider';
import { ShopStatsProvider } from '@/components/shell/ShopStats';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  // Read at request time so one build serves any buyer storefront origin.
  const storefrontUrl = process.env.WEB_APP_URL || 'http://localhost:3001';
  return (
    <Suspense fallback={<Spinner />}>
      <RequireRole role="seller">
        <ShopProvider>
          <ShopStatsProvider>
            <SellerShell storefrontUrl={storefrontUrl}>{children}</SellerShell>
          </ShopStatsProvider>
        </ShopProvider>
      </RequireRole>
    </Suspense>
  );
}
