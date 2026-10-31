'use client';

import { useEffect, useState } from 'react';
import type { AssistantSetupConnection } from '@huspee/sdk';
import { Badge, Button, Card, Spinner, useToast } from '@/components/ui';
import { defineMessages, useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';

const messages = defineMessages({
  vi: {
    title: 'Kết nối trợ lý giọng nói',
    shared: 'Dùng chung cho mọi cửa hàng',
    connected: 'Đã kết nối',
    notConnected: 'Chưa kết nối',
    waiting: 'Đang chờ đăng nhập',
    otherBrowser: 'Một trình duyệt khác đang kết nối Codex. Trạng thái sẽ tự cập nhật khi hoàn tất.',
    intro:
      'Trợ lý giọng nói chạy bằng tài khoản ChatGPT (gói Plus trở lên) qua Codex. Chỉ cần kết nối một lần; thông tin đăng nhập được lưu trên máy chủ của ứng dụng.',
    connect: 'Kết nối tài khoản ChatGPT',
    step1: 'Mở trang đăng nhập của OpenAI và đăng nhập',
    open: 'Mở trang đăng nhập',
    step2: 'Nhập mã dùng một lần này',
    deviceHint:
      'Nếu OpenAI báo chưa bật đăng nhập bằng mã: tại chatgpt.com/settings/security, bật “Enable device code sign-in for Codex, Excel, PowerPoint, and Word” rồi nhập lại mã.',
    copy: 'Sao chép',
    copied: 'Đã sao chép mã',
    pending: 'Đang chờ bạn hoàn tất đăng nhập…',
    expires: 'Mã hết hạn lúc {time}',
    cancel: 'Hủy',
    plan: 'Gói ChatGPT: {plan}',
    planUnknown: 'không rõ',
    fromApp: 'Đăng nhập từ ứng dụng.',
    fromHost: 'Dùng đăng nhập `codex login` trên máy chạy API.',
    needsPaid:
      'Gói này không có giọng nói của Codex. Liên hệ người vận hành để đổi sang tài khoản Plus hoặc Pro.',
    ready: 'Người mua có thể dùng trợ lý giọng nói ngay.',
    notInstalled: 'Máy chủ API chưa cài Codex CLI 0.166.0 nên chưa thể bật trợ lý giọng nói.',
    loginFailed: 'Đăng nhập không hoàn tất. Hãy thử lại.',
    loginExpired: 'Mã đã hết hạn. Hãy thử lại.',
    failed: 'Không thực hiện được. Hãy thử lại.',
    loadFailed: 'Không tải được trạng thái kết nối.',
    retry: 'Thử lại',
  },
  en: {
    title: 'Voice assistant connection',
    shared: 'Shared by every shop',
    connected: 'Connected',
    notConnected: 'Not connected',
    waiting: 'Waiting for sign-in',
    otherBrowser: 'Another browser is connecting Codex. This page will update when it finishes.',
    intro:
      'The voice assistant runs on a ChatGPT account (Plus plan or above) through Codex. Connect once; the login is saved on the app’s server.',
    connect: 'Connect ChatGPT account',
    step1: 'Open OpenAI’s sign-in page and sign in',
    open: 'Open sign-in page',
    step2: 'Enter this one-time code',
    deviceHint:
      'If OpenAI says device code sign-in is off: at chatgpt.com/settings/security, turn on “Enable device code sign-in for Codex, Excel, PowerPoint, and Word”, then enter the code again.',
    copy: 'Copy',
    copied: 'Code copied',
    pending: 'Waiting for you to finish signing in…',
    expires: 'The code expires at {time}',
    cancel: 'Cancel',
    plan: 'ChatGPT plan: {plan}',
    planUnknown: 'unknown',
    fromApp: 'Signed in from the app.',
    fromHost: 'Using `codex login` on the machine that runs the API.',
    needsPaid: 'This plan has no Codex voice. Ask the operator to switch to a Plus or Pro account.',
    ready: 'Buyers can use the voice assistant now.',
    notInstalled: 'The API server does not have Codex CLI 0.166.0, so the voice assistant cannot run.',
    loginFailed: 'Sign-in did not finish. Try again.',
    loginExpired: 'The code expired. Try again.',
    failed: 'That did not work. Try again.',
    loadFailed: 'Could not load the connection status.',
    retry: 'Retry',
  },
});

// Plans without Codex voice; anything else is assumed to have it.
const NO_VOICE_PLANS = new Set(['free', 'go']);
const PLAN_NAMES: Record<string, string> = {
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  promax: 'Pro Max',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
  free: 'Free',
  go: 'Go',
};

/** Connects the platform's ChatGPT account to the voice runtime with Codex's device-code sign-in. */
export function ConnectionCard() {
  const t = useT(messages);
  const toast = useToast();
  const connection = getApiClient().assistant.connection;
  const status = useApi(() => connection.get(), []);
  const [override, setOverride] = useState<AssistantSetupConnection | null>(null);
  const [working, setWorking] = useState(false);
  const data = override ?? status.data;
  const otherBrowser = data?.busy === true;
  const waiting = !!data?.login || otherBrowser;

  // Poll while a sign-in is waiting; the server learns the result from Codex.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      connection
        .get()
        .then(setOverride)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, connection]);

  async function run(action: 'login' | 'cancel') {
    setWorking(true);
    try {
      setOverride(await connection[action]());
    } catch {
      toast(t('failed'));
    } finally {
      setWorking(false);
    }
  }

  const badge = !data ? null : data.connected ? (
    <Badge tone="success">{t('connected')}</Badge>
  ) : waiting ? (
    <Badge tone="info">{t('waiting')}</Badge>
  ) : (
    <Badge tone="warning">{t('notConnected')}</Badge>
  );

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t('shared')}</p>
        </div>
        {badge}
      </div>

      {status.loading && !data ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner />
        </div>
      ) : !data ? (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <span>{t('loadFailed')}</span>
          <button type="button" onClick={status.reload} className="font-medium underline hover:no-underline">
            {t('retry')}
          </button>
        </div>
      ) : !data.installed ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t('notInstalled')}</p>
      ) : data.connected ? (
        <div className="space-y-3">
          <div className="space-y-1 text-sm text-gray-700">
            <p>{t('plan', { plan: data.plan ? (PLAN_NAMES[data.plan] ?? data.plan) : t('planUnknown') })}</p>
            <p className="text-xs text-gray-500">{data.source === 'app' ? t('fromApp') : t('fromHost')}</p>
          </div>
          {data.plan && NO_VOICE_PLANS.has(data.plan) ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t('needsPaid')}</p>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{t('ready')}</p>
          )}
        </div>
      ) : otherBrowser ? (
        <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{t('otherBrowser')}</p>
      ) : data.login ? (
        <div className="space-y-4">
          <ol className="space-y-4 text-sm text-gray-700">
            <li className="space-y-2">
              <p>
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  1
                </span>
                {t('step1')}
              </p>
              <a
                href={data.login.verification_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {t('open')}
              </a>
              <p className="text-xs break-all text-gray-400">{data.login.verification_url}</p>
            </li>
            <li className="space-y-2">
              <p>
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  2
                </span>
                {t('step2')}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-xl border border-line bg-gray-50 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em] text-ink">
                  {data.login.user_code}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(data.login!.user_code)
                      .then(() => toast(t('copied')))
                      .catch(() => undefined)
                  }
                >
                  {t('copy')}
                </Button>
              </div>
            </li>
          </ol>
          <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">{t('deviceHint')}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              {t('pending')}{' '}
              {t('expires', {
                time: new Date(data.login.expires_at * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
            <Button variant="ghost" size="sm" loading={working} onClick={() => void run('cancel')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('intro')}</p>
          {data.error && (
            <p className="text-sm text-red-600">
              {data.error === 'login_expired' ? t('loginExpired') : t('loginFailed')}
            </p>
          )}
          <Button variant="primary" loading={working} onClick={() => void run('login')}>
            {t('connect')}
          </Button>
        </div>
      )}
    </Card>
  );
}
