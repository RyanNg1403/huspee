import { Suspense } from 'react';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Spinner } from '@huspee/web-ui/components/ui';
import { getT } from '@huspee/web-ui/i18n/server';
import { AccountMenu } from '@/components/shell/AccountMenu';
import { FocusFrame } from '@/components/shell/Brand';
import { shellMessages } from '@/components/shell/messages';
import { ShopProvider } from '@/components/shell/ShopProvider';

/** Shop creation and Partner connection, without the Seller Centre sidebar. */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const t = await getT(shellMessages);
  return (
    <FocusFrame channel={t('channel')} right={<AccountMenu />}>
      <Suspense fallback={<Spinner />}>
        <RequireRole role="seller">
          <ShopProvider>{children}</ShopProvider>
        </RequireRole>
      </Suspense>
    </FocusFrame>
  );
}
