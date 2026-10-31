'use client';

import { useParams } from 'next/navigation';
import { ConversationDetail } from '@/components/assistant-review/conversations/ConversationDetail';
import { AssistantShopGuard } from '../../_components/AssistantShopGuard';

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AssistantShopGuard>
      {(shop) => (
        <ConversationDetail key={`${shop.shop_id}-${id}`} shopId={shop.shop_id} conversationId={id} />
      )}
    </AssistantShopGuard>
  );
}
