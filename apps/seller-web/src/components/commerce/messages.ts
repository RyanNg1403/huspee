import { defineMessages } from '@huspee/web-ui/i18n';

/** Labels shared by every commerce page. */
export const commerceMessages = defineMessages({
  vi: {
    prevPage: 'Trang trước',
    nextPage: 'Trang sau',
    range: '{start}–{end} / {total}',
    retry: 'Thử lại',
    loadFailed: 'Không tải được dữ liệu',
    noShop: 'Chưa chọn shop',
    goToShops: 'Đến danh sách shop',
    notConnected: 'Shop chưa kết nối',
    connect: 'Kết nối shop',
  },
  en: {
    prevPage: 'Previous page',
    nextPage: 'Next page',
    range: '{start}–{end} of {total}',
    retry: 'Retry',
    loadFailed: 'Could not load data',
    noShop: 'No shop selected',
    goToShops: 'Go to shops',
    notConnected: 'Shop is not connected',
    connect: 'Connect shop',
  },
});
