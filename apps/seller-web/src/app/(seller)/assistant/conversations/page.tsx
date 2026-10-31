'use client';

import { ConversationList } from '@/components/assistant-review/conversations/ConversationList';
import { AssistantShopGuard } from '../_components/AssistantShopGuard';

export default function AssistantConversationsPage() {
  return (
    <AssistantShopGuard>
      {(shop) => <ConversationList key={shop.shop_id} shopId={shop.shop_id} />}
    </AssistantShopGuard>
  );
}
