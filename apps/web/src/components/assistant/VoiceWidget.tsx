'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { VoicePanel } from './VoicePanel';

const adapter = {
  start: (input: { shop_id: number; sdp_offer: string; lang: string; resume_conversation_id?: string }) =>
    getApiClient().assistant.voice.start(input),
  startText: (input: { shop_id: number; lang: string; resume_conversation_id?: string }) =>
    getApiClient().assistant.text.start(input),
  text: (id: string, text: string) => getApiClient().assistant.voice.text(id, text),
  stop: (id: string) => getApiClient().assistant.voice.stop(id),
  eventsUrl: (id: string) => getApiClient().assistant.voice.eventsUrl(id),
  confirm: (id: string, key: string) => getApiClient().assistant.actions.confirm(id, key),
  options: (id: string) => getApiClient().assistant.actions.options(id),
  edit: (id: string, input: { quantity: number; model_id: number; line_index?: number }) =>
    getApiClient().assistant.actions.edit(id, input),
  cancel: (id: string) => getApiClient().assistant.actions.cancel(id),
  history: (shopId: number) => getApiClient().assistant.conversations.list(shopId),
  conversation: (id: string) => getApiClient().assistant.conversations.get(id),
};

const PageShop = createContext<(shopId: number | null) => void>(() => undefined);

/** Marks the current page as belonging to a shop, so the dock shows that shop's assistant. */
export function VoiceWidget({ shopId }: { shopId: number }) {
  const setPageShop = useContext(PageShop);
  useEffect(() => {
    setPageShop(shopId);
    return () => setPageShop(null);
  }, [shopId, setPageShop]);
  return null;
}

/**
 * Lives in the buyer layout so a conversation survives moving between pages (for example opening a
 * product the assistant showed). It follows the page's shop while idle and keeps its own shop while
 * a session is running.
 */
export function AssistantDock({ children }: { children: React.ReactNode }) {
  const [pageShop, setPageShop] = useState<number | null>(null);
  const [dockShop, setDockShop] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  // Follow the page's shop while idle; adjusting state during render avoids an extra effect pass.
  if (!active && pageShop !== null && pageShop !== dockShop) setDockShop(pageShop);
  const visible = dockShop !== null && (active || pageShop !== null);
  return (
    <PageShop.Provider value={setPageShop}>
      {children}
      {dockShop !== null && (
        <div hidden={!visible}>
          <DockedPanel key={dockShop} shopId={dockShop} onActiveChange={setActive} />
        </div>
      )}
    </PageShop.Provider>
  );
}

function DockedPanel({
  shopId,
  onActiveChange,
}: {
  shopId: number;
  onActiveChange: (active: boolean) => void;
}) {
  const profile = useApi(() => getApiClient().assistant.profile(shopId), [shopId]);
  if (profile.loading || profile.data?.enabled === false) return null;
  return (
    <VoicePanel
      shopId={shopId}
      adapter={adapter}
      profile={profile.data ?? undefined}
      onActiveChange={onActiveChange}
    />
  );
}
