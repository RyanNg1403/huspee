import { Suspense } from 'react';
import { RequireRole } from '@huspee/web-ui/components/session';
import { SellerShell } from '@/components/layout';
import { Spinner } from '@huspee/web-ui/components/ui';
export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <RequireRole role="seller">
        <SellerShell>{children}</SellerShell>
      </RequireRole>
    </Suspense>
  );
}
