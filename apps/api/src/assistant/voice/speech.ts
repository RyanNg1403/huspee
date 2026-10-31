/** App-authored action messages. Language comes from session settings or the agent's explicit tool. */
export type SpeechLanguage = 'vi' | 'en';

export const speechText = {
  replyUnavailable: {
    vi: 'Mình chưa hoàn tất được yêu cầu. Bạn thử lại giúp mình nhé.',
    en: 'I could not finish that request. Please try again.',
  },
  orderPlaced: {
    vi: 'Đơn hàng đã được đặt thành công. Bạn có thể xem chi tiết trong mục Đơn mua nhé.',
    en: 'Your order has been placed. You can see the details under My orders.',
  },
  returnOpened: {
    vi: 'Yêu cầu trả hàng đã được gửi tới người bán.',
    en: 'Your return request has been sent to the seller.',
  },
  returnCancelled: { vi: 'Yêu cầu hoàn tiền đã được hủy.', en: 'Your refund request has been cancelled.' },
  returnOfferAccepted: { vi: 'Bạn đã chấp nhận đề nghị hoàn tiền của người bán. Trạng thái hoàn tiền được cập nhật trong yêu cầu.', en: 'You accepted the seller refund offer. The request now shows the updated refund status.' },
  cancelled: { vi: 'Đã hủy, mình chưa thực hiện thao tác này.', en: "Cancelled; I haven't done that." },
  confirm: { vi: 'Bạn có đồng ý không?', en: 'Do you confirm?' },
  confirmTap: {
    vi: 'Nếu đúng, bạn bấm Xác nhận trên thẻ trên màn hình nhé.',
    en: 'If this is right, tap Confirm on the on-screen card.',
  },
} as const;
