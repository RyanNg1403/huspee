import { defineMessages } from '@huspee/web-ui/i18n';

export const returnDetailMessages = defineMessages({
  vi: {
    shop: 'Shop',
    photos: 'Hình ảnh',
    photoAlt: 'Ảnh {index} đã gửi',
    todoTitle: 'Việc của bạn lúc này',
    todoReview: 'Chưa cần làm gì. {shop} đang duyệt yêu cầu.',
    todoOffer: 'Trả lời đề nghị của {shop}.',
    todoDispute: 'Chưa cần làm gì. Huspee đang xem xét yêu cầu.',
    todoProcessing: 'Chưa cần làm gì. Yêu cầu đang được xử lý.',
    todoRefunded: 'Không cần làm gì thêm. Đã hoàn {amount} (mô phỏng).',
    todoCancelled: 'Không cần làm gì thêm. Bạn đã huỷ yêu cầu này.',
    todoClosed: 'Yêu cầu đã đóng.',
    simulated: '(mô phỏng)',
  },
  en: {
    shop: 'Shop',
    photos: 'Photos',
    photoAlt: 'Photo {index} you sent',
    todoTitle: 'What you need to do now',
    todoReview: 'Nothing yet. {shop} is reviewing the request.',
    todoOffer: 'Reply to the offer from {shop}.',
    todoDispute: 'Nothing yet. Huspee is reviewing the request.',
    todoProcessing: 'Nothing yet. The request is being processed.',
    todoRefunded: 'Nothing more to do. {amount} refunded (simulated).',
    todoCancelled: 'Nothing more to do. You cancelled this request.',
    todoClosed: 'The request is closed.',
    simulated: '(simulated)',
  },
});
