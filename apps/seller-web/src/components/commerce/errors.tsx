'use client';

import { HuspeeApiError } from '@huspee/sdk';
import { defineMessages } from '@huspee/web-ui/i18n';
import { useT } from '@huspee/web-ui/i18n/client';

const errorMessages = defineMessages({
  vi: {
    error_param: 'Thông tin không hợp lệ',
    error_invalid_status: 'Trạng thái hiện tại không cho phép thao tác này',
    error_not_found: 'Không tìm thấy',
    error_duplicate: 'Dữ liệu đã tồn tại',
    error_stock: 'Không đủ tồn kho',
    error_permission: 'Bạn không có quyền với shop này',
    network: 'Không thể kết nối máy chủ',
    unknown: 'Đã xảy ra lỗi',
  },
  en: {
    error_param: 'Invalid information',
    error_invalid_status: 'Not allowed in the current status',
    error_not_found: 'Not found',
    error_duplicate: 'Already exists',
    error_stock: 'Not enough stock',
    error_permission: 'You do not have access to this shop',
    network: 'Unable to connect to the server',
    unknown: 'Something went wrong',
  },
});

type ErrorKey = keyof (typeof errorMessages)['vi'];

/** Shopee-compatible error code → message key; the API's own message is kept as detail. */
export function errorKey(e: unknown): ErrorKey {
  if (e instanceof HuspeeApiError) {
    const code =
      e.code === 'error_auth'
        ? 'error_permission'
        : e.code.includes('duplicate')
          ? 'error_duplicate'
          : e.code;
    return code in errorMessages.vi ? (code as ErrorKey) : 'unknown';
  }
  return e instanceof TypeError ? 'network' : 'unknown';
}

export function useErrorText() {
  const t = useT(errorMessages);
  return (e: unknown) => {
    // A plain Error carries a per-row failed_reason from a batch response.
    if (e instanceof Error && e.constructor === Error && e.message)
      return `${t('error_param')}: ${e.message}`;
    const detail = e instanceof HuspeeApiError && e.message ? e.message : '';
    return detail ? `${t(errorKey(e))}: ${detail}` : t(errorKey(e));
  };
}

/** Inline failure message for forms and dialogs; a string is shown as given (client validation). */
export function ActionError({ error }: { error: unknown }) {
  const text = useErrorText();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[4px] bg-primary-soft px-3 py-2 text-sm text-primary-hover">
      {typeof error === 'string' ? error : text(error)}
    </p>
  );
}
