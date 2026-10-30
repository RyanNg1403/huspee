'use client';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { VoicePanel } from './VoicePanel';

const adapter = {
  start: (input: { shop_id: number; sdp_offer: string; lang: string }) =>
    getApiClient().assistant.voice.start(input),
  startText: (input: { shop_id: number; lang: string }) => getApiClient().assistant.text.start(input),
  text: (id: string, text: string) => getApiClient().assistant.voice.text(id, text),
  stop: (id: string) => getApiClient().assistant.voice.stop(id),
  eventsUrl: (id: string) => getApiClient().assistant.voice.eventsUrl(id),
  confirm: (id: string, key: string) => getApiClient().assistant.actions.confirm(id, key),
  options: (id: string) => getApiClient().assistant.actions.options(id),
  edit: (id: string, input: { quantity: number; model_id: number; line_index?: number }) =>
    getApiClient().assistant.actions.edit(id, input),
  cancel: (id: string) => getApiClient().assistant.actions.cancel(id),
};

export function VoiceWidget({ shopId }: { shopId: number }) {
  const profile = useApi(() => getApiClient().assistant.profile(shopId), [shopId]);
  if (profile.loading || profile.data?.enabled === false) return null;
  return <VoicePanel shopId={shopId} adapter={adapter} />;
}
