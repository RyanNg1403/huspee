'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@huspee/web-ui/components/ui';
import { useSession } from '@huspee/web-ui/components/session/SessionProvider';
export function RequireRole({ role, children }: { role: 'buyer' | 'seller'; children: ReactNode }) {
  const { user, status } = useSession();
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const allowed = status === 'authenticated' && user?.roles.includes(role);
  useEffect(() => {
    if (status !== 'loading' && !allowed) {
      // Preserve the requested path and query for the login redirect.
      const next = path + (search.toString() ? `?${search}` : '');
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, allowed, path, search, router]);
  if (!allowed)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  return children;
}
