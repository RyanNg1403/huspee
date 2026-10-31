'use client';

import { useState } from 'react';
import type { AssistantFaq } from '@huspee/sdk';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { AssistantShopGuard } from '../_components/AssistantShopGuard';
import { assistantMessages } from '../messages';

export default function AssistantFaqsPage() {
  return <AssistantShopGuard>{(shop) => <AssistantFaqsContent shopId={shop.shop_id} />}</AssistantShopGuard>;
}

function AssistantFaqsContent({ shopId }: { shopId: number }) {
  const t = useT(assistantMessages);
  const commonT = useT(common);
  const toast = useToast();

  const faqsApi = useApi(async () => {
    return getApiClient().seller.assistant.faqs.list(shopId);
  }, [shopId]);

  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<AssistantFaq | null>(null);
  const [deletingFaq, setDeletingFaq] = useState<AssistantFaq | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingFaqId, setTogglingFaqId] = useState<number | null>(null);

  // Form states
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [lang, setLang] = useState<'vi' | 'en' | 'any'>('vi');
  const [enabled, setEnabled] = useState(true);

  function openCreateModal() {
    setQuestion('');
    setAnswer('');
    setLang('vi');
    setEnabled(true);
    setCreateOpen(true);
  }

  function openEditModal(faq: AssistantFaq) {
    setEditingFaq(faq);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setLang(faq.lang);
    setEnabled(faq.enabled);
  }

  async function handleCreate() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      await getApiClient().seller.assistant.faqs.create(shopId, {
        question: question.trim(),
        answer: answer.trim(),
        lang,
        enabled,
      });
      toast(t('createSuccess'));
      setCreateOpen(false);
      faqsApi.reload();
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingFaq || !question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      await getApiClient().seller.assistant.faqs.update(shopId, editingFaq.id, {
        question: question.trim(),
        answer: answer.trim(),
        lang,
        enabled,
      });
      toast(t('updateSuccess'));
      setEditingFaq(null);
      faqsApi.reload();
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(faq: AssistantFaq) {
    if (togglingFaqId !== null) return;
    setTogglingFaqId(faq.id);
    try {
      await getApiClient().seller.assistant.faqs.update(shopId, faq.id, {
        enabled: !faq.enabled,
      });
      toast(t('updateSuccess'));
      faqsApi.reload();
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('saveFailed'));
    } finally {
      setTogglingFaqId(null);
    }
  }

  async function handleDelete() {
    if (!deletingFaq) return;
    setSaving(true);
    try {
      await getApiClient().seller.assistant.faqs.remove(shopId, deletingFaq.id);
      toast(t('deleteSuccess'));
      setDeletingFaq(null);
      faqsApi.reload();
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const langBadges: Record<'vi' | 'en' | 'any', { label: string; tone: 'info' | 'warning' | 'neutral' }> = {
    vi: { label: t('langVi'), tone: 'info' },
    en: { label: t('langEn'), tone: 'warning' },
    any: { label: t('langAny'), tone: 'neutral' },
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('faqsTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('faqsDesc')}</p>
        </div>
        <Button variant="primary" onClick={openCreateModal}>
          + {t('addFaq')}
        </Button>
      </div>

      {/* Sub Nav */}

      {/* Content State */}
      {faqsApi.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : faqsApi.error ? (
        <ErrorState message={t('loadFailed')} onRetry={faqsApi.reload} retryLabel={t('retry')} />
      ) : !faqsApi.data || faqsApi.data.length === 0 ? (
        <EmptyState title={t('noFaqs')}>
          <p className="mt-1 text-xs text-gray-400">{t('noFaqsDesc')}</p>
          <div className="mt-4">
            <Button variant="primary" onClick={openCreateModal}>
              + {t('addFaq')}
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">{t('question')}</th>
                  <th className="px-4 py-3">{t('answer')}</th>
                  <th className="px-4 py-3">{t('language')}</th>
                  <th className="px-4 py-3">{t('status')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {faqsApi.data.map((faq) => {
                  const badgeInfo = langBadges[faq.lang] ?? langBadges.any;
                  return (
                    <tr key={faq.id} className="hover:bg-gray-50/50">
                      <td className="max-w-xs px-4 py-3 font-medium text-gray-900">{faq.question}</td>
                      <td className="max-w-md px-4 py-3 text-gray-600 line-clamp-2">{faq.answer}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={badgeInfo.tone}>{badgeInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={togglingFaqId === faq.id}
                          onClick={() => void handleToggleEnabled(faq)}
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            togglingFaqId === faq.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${faq.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <span className={faq.enabled ? 'text-green-700 font-medium' : 'text-gray-500'}>
                            {faq.enabled ? t('active') : t('disabled')}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditModal(faq)}>
                            {t('editFaq')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => setDeletingFaq(faq)}
                          >
                            {t('deleteFaq')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {faqsApi.data.map((faq) => {
              const badgeInfo = langBadges[faq.lang] ?? langBadges.any;
              return (
                <Card key={faq.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{faq.question}</span>
                    <Badge tone={badgeInfo.tone}>{badgeInfo.label}</Badge>
                  </div>
                  <p className="text-xs text-gray-600">{faq.answer}</p>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      disabled={togglingFaqId === faq.id}
                      onClick={() => void handleToggleEnabled(faq)}
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        togglingFaqId === faq.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${faq.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                      <span className={faq.enabled ? 'text-green-700 font-medium' : 'text-gray-500'}>
                        {faq.enabled ? t('active') : t('disabled')}
                      </span>
                    </button>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(faq)}>
                        {t('editFaq')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setDeletingFaq(faq)}
                      >
                        {t('deleteFaq')}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('addFaq')}>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('question')}</label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('questionPlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('answer')}</label>
            <Textarea
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t('answerPlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('language')}</label>
              <Select value={lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en' | 'any')}>
                <option value="vi">{t('langVi')}</option>
                <option value="en">{t('langEn')}</option>
                <option value="any">{t('langAny')}</option>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="createEnabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="createEnabled" className="text-xs font-medium text-gray-700">
                {t('active')}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!question.trim() || !answer.trim()}
              onClick={() => void handleCreate()}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editingFaq !== null} onClose={() => setEditingFaq(null)} title={t('editFaq')}>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('question')}</label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('questionPlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('answer')}</label>
            <Textarea
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t('answerPlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('language')}</label>
              <Select value={lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en' | 'any')}>
                <option value="vi">{t('langVi')}</option>
                <option value="en">{t('langEn')}</option>
                <option value="any">{t('langAny')}</option>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="editEnabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="editEnabled" className="text-xs font-medium text-gray-700">
                {t('active')}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="ghost" onClick={() => setEditingFaq(null)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!question.trim() || !answer.trim()}
              onClick={() => void handleUpdate()}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deletingFaq !== null} onClose={() => setDeletingFaq(null)} title={t('deleteFaq')}>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">{t('deleteConfirm')}</p>
          {deletingFaq && (
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-900">{deletingFaq.question}</p>
              <p className="mt-1 line-clamp-2">{deletingFaq.answer}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="ghost" onClick={() => setDeletingFaq(null)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-red-600 hover:bg-red-700"
              loading={saving}
              onClick={() => void handleDelete()}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
