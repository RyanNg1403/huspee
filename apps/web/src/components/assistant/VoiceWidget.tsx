'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { OPEN_ASSISTANT_EVENT } from './open-assistant';
import { readPinnedPreference, writePinnedPreference } from './panel-layout';
import type { ViewedOrder, ViewedProduct } from './product-context';
import { useChatScrollLock } from './use-chat-scroll-lock';
import { SHEET_QUERY } from './use-media-query';
import { usePinnedBounds } from './use-pinned-bounds';
import { VoicePanel, type Adapter, type PanelPage } from './VoicePanel';

export { openAssistant } from './open-assistant';

const adapter: Adapter = {
  start: (input) => getApiClient().assistant.voice.start(input),
  startText: (input) => getApiClient().assistant.text.start(input),
  text: (id, text) => getApiClient().assistant.voice.text(id, text),
  startCall: (id, sdp) => getApiClient().assistant.voice.startCall(id, sdp),
  stopCall: (id, callId) => getApiClient().assistant.voice.stopCall(id, callId),
  setContext: (id, itemId) => getApiClient().assistant.voice.setContext(id, itemId),
  stop: (id) => getApiClient().assistant.voice.stop(id),
  eventsUrl: (id) => getApiClient().assistant.voice.eventsUrl(id),
  poll: (id, after) => getApiClient().assistant.voice.poll(id, after),
  confirm: (id, key) => getApiClient().assistant.actions.confirm(id, key),
  options: (id) => getApiClient().assistant.actions.options(id),
  edit: (id, input) => getApiClient().assistant.actions.edit(id, input),
  cancel: (id) => getApiClient().assistant.actions.cancel(id),
  history: (shopId) => getApiClient().assistant.conversations.list(shopId),
  conversation: (id) => getApiClient().assistant.conversations.get(id),
};

type PageContext = PanelPage & { shopId: number };
const PageShop = createContext<(page: PageContext | null) => void>(() => undefined);

/**
 * Marks the current page as belonging to a shop, so the dock shows that shop's assistant with what
 * the buyer is looking at: a product (and the variant picked), an order, or the shop itself.
 */
export function VoiceWidget({
  shopId,
  product,
  model,
  order,
}: {
  shopId: number;
  product?: ViewedProduct;
  /** The variant picked on the product page, with the price the page shows for it. */
  model?: { model_id: number; name: string; price: number };
  order?: ViewedOrder;
}) {
  const setPageShop = useContext(PageShop);
  const itemId = product?.item_id, name = product?.name, image = product?.image;
  const variant = model?.name || product?.variant;
  const price = model?.price ?? product?.price;
  const orderSn = order?.order_sn, orderStatus = order?.status, orderImage = order?.image;
  useEffect(() => {
    setPageShop({
      shopId,
      product: itemId !== undefined && name !== undefined ? { item_id: itemId, name, image, variant, price } : undefined,
      order: orderSn !== undefined && orderStatus !== undefined ? { order_sn: orderSn, status: orderStatus, image: orderImage } : undefined,
    });
    return () => setPageShop(null);
  }, [shopId, itemId, name, image, variant, price, orderSn, orderStatus, orderImage, setPageShop]);
  return null;
}

/**
 * Lives in the buyer layout so a conversation survives moving between pages of the same shop (for
 * example opening a product the assistant showed). Opening another shop's page switches to that
 * shop's assistant; nothing from the previous shop is carried over. On wide screens the page column
 * leaves room for the pinned panel.
 */
export function AssistantDock({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageContext | null>(null);
  const [dockShop, setDockShop] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [pinned, setPinnedState] = useState(() =>
    readPinnedPreference(typeof window === 'undefined' ? undefined : window.sessionStorage),
  );
  const [sheet, setSheet] = useState(false);
  // Follow the page's shop; adjusting state during render avoids an extra effect pass.
  if (page !== null && page.shopId !== dockShop) setDockShop(page.shopId);
  const visible = dockShop !== null && (active || page !== null);
  // A sheet left open on a page without the assistant must not reopen by itself later.
  if (!visible && sheet) setSheet(false);
  const profile = useApi(
    () => (dockShop === null ? Promise.resolve(null) : getApiClient().assistant.profile(dockShop)),
    [dockShop],
  );
  const shop = useApi(
    () => (dockShop === null ? Promise.resolve(null) : getApiClient().marketplace.getShop(dockShop)),
    [dockShop],
  );
  const shown = visible && profile.data?.enabled !== false;
  const column = useRef<HTMLDivElement>(null);
  usePinnedBounds(column, shown);
  useChatScrollLock(shown && sheet);
  const setPinned = useCallback((open: boolean) => {
    setPinnedState(open);
    writePinnedPreference(window.sessionStorage, open);
  }, []);
  const available = shown && !profile.loading;
  useEffect(() => {
    if (!available) return;
    const open = (event: Event) => {
      // Handled here: the page must not fall back to anything else.
      event.preventDefault();
      if (window.matchMedia(SHEET_QUERY).matches) setSheet(true);
      else setPinned(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, open);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, open);
  }, [available, setPinned]);
  const room = shown ? `${pinned ? 'lg:pr-[380px]' : 'lg:pr-[76px]'} max-lg:pb-[72px]` : '';
  return (
    <PageShop.Provider value={setPage}>
      <div ref={column} className={`flex flex-1 flex-col ${room}`}>
        {children}
      </div>
      {dockShop !== null && !profile.loading && profile.data?.enabled !== false && (
        <VoicePanel
          key={dockShop}
          visible={visible}
          shopId={dockShop}
          page={page?.shopId === dockShop ? page : undefined}
          adapter={adapter}
          profile={profile.data ?? undefined}
          logo={shop.data?.logo_url}
          pinned={pinned}
          sheet={sheet}
          onPinnedChange={setPinned}
          onSheetChange={setSheet}
          onActiveChange={setActive}
        />
      )}
    </PageShop.Provider>
  );
}
