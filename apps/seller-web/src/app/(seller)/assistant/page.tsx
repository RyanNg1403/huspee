'use client';

import { useMemo, useState } from 'react';
import type { AssistantConfig } from '@huspee/sdk';
import { Button, Card, ErrorState, Select, Spinner, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { Block, StatusDot } from '@/components/shell';
import { AssistantShopGuard } from './_components/AssistantShopGuard';
import { assistantMessages } from './messages';

export default function AssistantSettingsPage() {
  const t = useT(assistantMessages);
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('assistantTitle')}</h1>
      </div>

      {/* Sub Nav */}

      <AssistantShopGuard>
        {(shop) => <AssistantSettingsContent shopId={shop.shop_id} shopName={shop.shop_name} />}
      </AssistantShopGuard>
    </div>
  );
}

function AssistantSettingsContent({ shopId, shopName }: { shopId: number; shopName: string }) {
  const t = useT(assistantMessages);

  const configApi = useApi(async () => {
    return getApiClient().seller.assistant.getConfig(shopId);
  }, [shopId]);

  const voicesApi = useApi(async () => {
    const res = await getApiClient().assistant.voices();
    return res.voices ?? [];
  }, []);

  return (
    <>
      {/* Main Content State */}
      {configApi.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : configApi.error || !configApi.data ? (
        <ErrorState message={t('loadFailed')} onRetry={configApi.reload} retryLabel={t('retry')} />
      ) : (
        <AssistantSettingsForm
          key={`${shopId}-${configApi.data.updated_at}`}
          config={configApi.data}
          voices={voicesApi.data}
          voicesError={voicesApi.error}
          onReloadVoices={voicesApi.reload}
          shopId={shopId}
          shopName={shopName}
          onSaved={configApi.reload}
        />
      )}
    </>
  );
}

function AssistantSettingsForm({
  config,
  voices,
  voicesError,
  onReloadVoices,
  shopId,
  shopName,
  onSaved,
}: {
  config: AssistantConfig;
  voices?: string[] | null;
  voicesError?: unknown;
  onReloadVoices: () => void;
  shopId: number;
  shopName: string;
  onSaved: () => void;
}) {
  const t = useT(assistantMessages);
  const commonT = useT(common);
  const { lang } = useLang();
  const toast = useToast();

  const [enabled, setEnabled] = useState(config.enabled);
  const [tone, setTone] = useState<'FRIENDLY' | 'PROFESSIONAL' | 'ENTHUSIASTIC'>(config.tone || 'FRIENDLY');
  const [voice, setVoice] = useState(config.voice || 'spruce');
  const [greetingVi, setGreetingVi] = useState(config.greeting_vi || '');
  const [greetingEn, setGreetingEn] = useState(config.greeting_en || '');
  const [saving, setSaving] = useState(false);
  const [previewLangOverride, setPreviewLangOverride] = useState<'vi' | 'en' | null>(null);

  const previewLang = previewLangOverride ?? (lang === 'en' ? 'en' : 'vi');

  // Keep saved voice and only offer supported voices from server
  const availableVoices = useMemo(() => {
    const list = voices && voices.length > 0 ? [...voices] : [];
    if (config.voice && !list.includes(config.voice)) {
      list.unshift(config.voice);
    }
    if (list.length === 0) {
      list.push(config.voice || 'spruce');
    }
    return list;
  }, [voices, config.voice]);

  async function handleSave() {
    setSaving(true);
    try {
      await getApiClient().seller.assistant.updateConfig(shopId, {
        enabled,
        tone,
        voice,
        greeting_vi: greetingVi.trim(),
        greeting_en: greetingEn.trim(),
      });
      toast(t('saveSuccess'));
      onSaved();
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Settings Form */}
      <div className="space-y-6 lg:col-span-2">
        <Card className="space-y-6">
          {/* Enable Switch */}
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
            <h2 className="text-base font-semibold text-gray-900">{t('enableAssistant')}</h2>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="peer sr-only"
                aria-label={t('enableAssistant')}
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none" />
            </label>
          </div>

          {/* Tone Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('toneLabel')}</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'FRIENDLY',
                    label: t('toneFriendly'),
                    desc: t('toneFriendlyDesc'),
                  },
                  {
                    value: 'PROFESSIONAL',
                    label: t('toneProfessional'),
                    desc: t('toneProfessionalDesc'),
                  },
                  {
                    value: 'ENTHUSIASTIC',
                    label: t('toneEnthusiastic'),
                    desc: t('toneEnthusiasticDesc'),
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTone(item.value)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    tone === item.value
                      ? 'border-primary bg-orange-50/50 text-primary ring-1 ring-primary'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900">{item.label}</div>
                  <div className="mt-1 text-xs text-gray-500">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('voiceLabel')}</label>
            <Select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full sm:w-64">
              {availableVoices.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </Select>
            {Boolean(voicesError) && (
              <div className="mt-1 flex items-center gap-2 text-xs text-red-600">
                <span>{t('voiceCatalogError')}</span>
                <button
                  type="button"
                  onClick={() => onReloadVoices()}
                  className="font-medium underline hover:no-underline"
                >
                  {t('retry')}
                </button>
              </div>
            )}
          </div>

          {/* Vietnamese Greeting */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">{t('greetingViLabel')}</label>
            <Textarea
              rows={3}
              value={greetingVi}
              onChange={(e) => setGreetingVi(e.target.value)}
              placeholder={t('greetingViPlaceholder')}
              className="w-full text-sm"
            />
          </div>

          {/* English Greeting */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">{t('greetingEnLabel')}</label>
            <Textarea
              rows={3}
              value={greetingEn}
              onChange={(e) => setGreetingEn(e.target.value)}
              placeholder={t('greetingEnPlaceholder')}
              className="w-full text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-2">
            <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Preview Card */}
      <div className="space-y-4">
        <VoiceConnection shopId={shopId} />
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="font-semibold text-gray-900 text-sm">{t('previewTitle')}</h3>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPreviewLangOverride('vi')}
                className={`rounded px-2 py-0.5 ${
                  previewLang === 'vi' ? 'bg-white font-medium text-gray-900 shadow-xs' : 'text-gray-500'
                }`}
              >
                VI
              </button>
              <button
                type="button"
                onClick={() => setPreviewLangOverride('en')}
                className={`rounded px-2 py-0.5 ${
                  previewLang === 'en' ? 'bg-white font-medium text-gray-900 shadow-xs' : 'text-gray-500'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Simulated Assistant Bubble */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-xs">
                AI
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-900">{shopName}</span>
                <span className="ml-1 text-[10px] text-gray-400">· {voice}</span>
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 text-sm text-gray-800 shadow-xs">
              {previewLang === 'vi' ? greetingVi : greetingEn}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                {enabled ? t('active') : t('disabled')}
              </span>
              <span className="rounded-lg bg-orange-100/70 px-1.5 py-0.5 text-primary font-medium">
                {tone}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Whether buyers can talk to the assistant: the platform's voice runtime is signed in. */
function VoiceConnection({ shopId }: { shopId: number }) {
  const t = useT(assistantMessages);
  const profile = useApi(() => getApiClient().assistant.profile(shopId), [shopId]);
  return (
    <Block size="sm" title={t('voiceConnection')}>
      {profile.data ? (
        <span className="text-sm">
          <StatusDot tone={profile.data.connected ? 'success' : 'neutral'}>
            {t(profile.data.connected ? 'connected' : 'notConnected')}
          </StatusDot>
        </span>
      ) : profile.error ? (
        <span className="text-sm text-muted">{t('loadFailed')}</span>
      ) : (
        <Spinner />
      )}
    </Block>
  );
}
