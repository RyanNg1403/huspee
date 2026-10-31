'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@huspee/web-ui/components/session';
import { getApiClient } from '@huspee/web-ui/lib/api';

/** Keeps the signed-in buyer's count fresh on focus and on the given window events; 0 when it fails. */
function useLiveCount(
  buyerId: number | null,
  load: () => Promise<number>,
  events: string[],
  intervalMs?: number,
) {
  const [count, setCount] = useState(0);
  const eventKey = events.join(' ');
  useEffect(() => {
    if (buyerId === null) return;
    let active = true;
    const refresh = () => {
      load()
        .then((n) => active && setCount(n))
        .catch(() => active && setCount(0));
    };
    refresh();
    const names = ['focus', ...eventKey.split(' ')];
    for (const name of names) window.addEventListener(name, refresh);
    const timer = intervalMs ? setInterval(refresh, intervalMs) : undefined;
    return () => {
      active = false;
      for (const name of names) window.removeEventListener(name, refresh);
      clearInterval(timer);
    };
  }, [buyerId, load, eventKey, intervalMs]);
  return buyerId === null ? 0 : count;
}

const loadCart = () =>
  getApiClient()
    .cart.get()
    .then((cart) => cart.item_count);
const loadUnread = () =>
  getApiClient()
    .buyer.messages.unreadCount()
    .then((res) => res.count);

/** Cart item count and unread shop replies for the signed-in buyer (0 for everyone else). */
export function useHeaderCounts() {
  const { user, status } = useSession();
  const buyerId = status === 'authenticated' && user?.roles.includes('buyer') ? user.user_id : null;
  const cart = useLiveCount(buyerId, loadCart, ['huspee:cart-changed']);
  const unread = useLiveCount(buyerId, loadUnread, ['huspee:messages-changed'], 30_000);
  return { cart, unread };
}
