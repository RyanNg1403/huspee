import { countBy, matchesSearch } from '../list';

export type ReturnStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'CANCELLED'
  | 'JUDGING'
  | 'CLOSED'
  | 'PROCESSING'
  | 'SELLER_DISPUTE';

export const RETURN_TABS = ['all', 'pending', 'processing', 'refunded', 'closed'] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];

export type ReturnRef = {
  return_sn: string;
  order_sn: string;
  status: ReturnStatus;
  negotiation_status?: string;
  user?: { username?: string };
};

/** Shop must answer: a new request with no seller offer waiting on the buyer. */
export function needsSellerAction(r: Pick<ReturnRef, 'status' | 'negotiation_status'>): boolean {
  return r.status === 'REQUESTED' && r.negotiation_status !== 'PENDING_BUYER_RESPOND';
}

export function returnTabOf(r: ReturnRef): Exclude<ReturnTab, 'all'> {
  if (needsSellerAction(r)) return 'pending';
  if (r.status === 'ACCEPTED') return 'refunded';
  if (r.status === 'CANCELLED' || r.status === 'CLOSED') return 'closed';
  return 'processing';
}

export function countReturnTabs(list: ReturnRef[]): Record<ReturnTab, number> {
  return countBy(list, RETURN_TABS, (r) => ['all', returnTabOf(r)]);
}

export function filterReturns<T extends ReturnRef>(list: T[], tab: ReturnTab, query: string): T[] {
  return list.filter(
    (r) =>
      (tab === 'all' || returnTabOf(r) === tab) &&
      matchesSearch(query, [r.return_sn, r.order_sn, r.user?.username]),
  );
}
