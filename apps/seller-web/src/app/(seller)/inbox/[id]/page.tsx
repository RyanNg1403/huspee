'use client';

import { useParams } from 'next/navigation';
import { useSelectedShop } from '@/components/layout';
import { TicketDetail } from '@/components/assistant-review/inbox/TicketDetail';

export default function SellerTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedShopId } = useSelectedShop();
  if (selectedShopId === null) return null;
  return <TicketDetail key={`${selectedShopId}-${id}`} shopId={selectedShopId} ticketId={Number(id)} />;
}
