'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { VoicePanel } from './VoicePanel';
import type { ViewedProduct } from './product-context';
import { useChatScrollLock } from './use-chat-scroll-lock';

const adapter = {
  start: (input: { shop_id: number; sdp_offer: string; lang: string; resume_conversation_id?: string; item_id?: number }) =>
    getApiClient().assistant.voice.start(input),
  startText: (input: { shop_id: number; lang: string; resume_conversation_id?: string; item_id?: number }) =>
    getApiClient().assistant.text.start(input),
  text: (id: string, text: string) => getApiClient().assistant.voice.text(id, text),
  startCall: (id: string, sdp: string) => getApiClient().assistant.voice.startCall(id, sdp),
  stopCall: (id: string, callId?: string) => getApiClient().assistant.voice.stopCall(id, callId),
  setContext: (id: string, itemId: number | null) => getApiClient().assistant.voice.setContext(id, itemId),
  stop: (id: string) => getApiClient().assistant.voice.stop(id),
  eventsUrl: (id: string) => getApiClient().assistant.voice.eventsUrl(id),
  poll: (id: string, after: number) => getApiClient().assistant.voice.poll(id, after),
  confirm: (id: string, key: string) => getApiClient().assistant.actions.confirm(id, key),
  options: (id: string) => getApiClient().assistant.actions.options(id),
  edit: (id: string, input: { quantity: number; model_id: number; line_index?: number }) =>
    getApiClient().assistant.actions.edit(id, input),
  cancel: (id: string) => getApiClient().assistant.actions.cancel(id),
  history: (shopId: number) => getApiClient().assistant.conversations.list(shopId),
  conversation: (id: string) => getApiClient().assistant.conversations.get(id),
};

type PageContext = { shopId: number; product?: ViewedProduct };
const PageShop = createContext<(page: PageContext | null) => void>(() => undefined);

/** Marks the current page as belonging to a shop, so the dock shows that shop's assistant. */
export function VoiceWidget({ shopId, product }: { shopId: number; product?: ViewedProduct }) {
  const setPageShop = useContext(PageShop);
  const itemId = product?.item_id, name = product?.name, image = product?.image;
  useEffect(() => {
    setPageShop({ shopId, product: itemId !== undefined && name !== undefined ? { item_id: itemId, name, image } : undefined });
    return () => setPageShop(null);
  }, [shopId, itemId, name, image, setPageShop]);
  return null;
}

/**
 * Lives in the buyer layout so a conversation survives moving between pages (for example opening a
 * product the assistant showed). It follows the page's shop while idle and keeps its own shop while
 * a session is running.
 */
export function AssistantDock({ children }: { children: React.ReactNode }) {
  const [pageShop, setPageShop] = useState<PageContext | null>(null);
  const [dockShop, setDockShop] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Follow the page's shop while idle; adjusting state during render avoids an extra effect pass.
  if (!active && pageShop !== null && pageShop.shopId !== dockShop) setDockShop(pageShop.shopId);
  const visible = dockShop !== null && (active || pageShop !== null);
  useChatScrollLock(visible && panelOpen);
  return (
    <PageShop.Provider value={setPageShop}>
      {children}
      {dockShop !== null && (
        <div hidden={!visible}>
          <DockedPanel key={dockShop} visible={visible} shopId={dockShop} product={pageShop?.shopId === dockShop ? pageShop.product : undefined} onActiveChange={setActive} onOpenChange={setPanelOpen} />
        </div>
      )}
    </PageShop.Provider>
  );
}

function DockedPanel({
  visible,
  shopId,
  product,
  onActiveChange,
  onOpenChange,
}: {
  visible: boolean;
  shopId: number;
  product?: ViewedProduct;
  onActiveChange: (active: boolean) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const profile = useApi(() => getApiClient().assistant.profile(shopId), [shopId]);
  if (profile.loading || profile.data?.enabled === false) return null;
  return (
    <VoicePanel
      visible={visible}
      shopId={shopId}
      product={product}
      adapter={adapter}
      profile={profile.data ?? undefined}
      onActiveChange={onActiveChange}
      onOpenChange={onOpenChange}
    />
  );
}
