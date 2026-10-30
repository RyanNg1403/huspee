'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RequireRole } from '@/components/session';
import { Spinner } from '@/components/ui';

function AccountRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/account/addresses');
  }, [router]);

  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireRole role="buyer">
      <AccountRedirect />
    </RequireRole>
  );
}
