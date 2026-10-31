'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@huspee/web-ui/components/ui';
import { useSession } from '@huspee/web-ui/components/session';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { messages } from './messages';

/** Adds a model to the buyer's cart (signing in first if needed); "buy now" then opens the cart. */
export function useAddToCart() {
  const t = useT(messages);
  const c = useT(common);
  const session = useSession();
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function add(modelId: number, quantity: number, buyNow: boolean) {
    if (session.status === 'loading') return false;
    if (session.status === 'anonymous') {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return false;
    }
    if (!session.user?.roles.includes('buyer')) {
      toast(t('buyerOnly'));
      return false;
    }
    setPending(true);
    try {
      await getApiClient().cart.addItem(modelId, quantity);
      window.dispatchEvent(new Event('huspee:cart-changed'));
      if (buyNow) router.push('/cart');
      else toast(t('added'));
      return true;
    } catch (e) {
      toast(c(errorMessageKey(e)));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { add, pending, ready: session.status !== 'loading' };
}
