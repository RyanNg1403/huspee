# Thiết kế frontend Huspee (U0)

Bản thiết kế đã được người dùng duyệt qua 3 đợt cho kế hoạch [tách và thiết kế lại frontend](../../FRONTEND_REDESIGN_PLAN_2026-10-31.md). Đây là nguồn tham chiếu khi code U1–U3 và phần UI của F1–F8.

- Canvas gốc (chia sẻ trong tổ chức): https://claude.ai/artifact/QDw9uznxZRBEoyPGw95u1v
- `screens/`: 84 màn ở định dạng canvas (`.dc.html`). Đây là bản vẽ, không phải code app.
- `screenshots/`: ảnh chụp từng màn (mobile 390×844, web 1440 toàn trang).
- `specs/`: dữ liệu mẫu và quy tắc dùng khi vẽ (`PHASE2_SPEC.md`, `PHASE3_SPEC.md`). Số liệu ở đây là chuẩn khi viết fixture và test UI.
- `canvas.json`: bố cục canvas, tên và thứ tự màn theo luồng.
- `tools/render.mjs`: dựng lại màn để so với bản code. Chạy từ gốc repo:
  `node docs/design/frontend-redesign/tools/render.mjs --all /tmp/huspee-design` hoặc
  `node docs/design/frontend-redesign/tools/render.mjs <màn> <rộng> <cao|full> <ảnh.png>`.

## Nguyên tắc đã chốt với người dùng

1. **Hai site.** Người mua: web và mobile web. Kênh Người Bán: chỉ web.
2. **Kiểu sàn TMĐT quen thuộc (tham khảo bố cục Shopee / Shopee Seller Centre).** Mật độ thông tin cao, trung tính, một màu nhấn `#d9381a`. Không dùng tên, logo hay tài sản thương hiệu của sàn khác.
3. **Không "AI slop".** Không pill màu cho mọi nhãn, không khối nào cũng là card + dòng chú thích xám, không câu chào kiểu chatbot, không biểu đồ trang trí, không hộp tím "AI". Số liệu màu chữ thường, trạng thái là chấm nhỏ + chữ.
4. **Không viết câu giải thích cách UI hoạt động.** Người dùng đã tự xoá những câu như "Nói “đồng ý” không đặt được đơn — bạn cần chạm", "Không bắt buộc…", "Đây là hộp thư, không phải chat trực tiếp…", "— còn 4 ngày". Chỉ ghi dữ kiện và nhãn.
5. **Trợ lý là mặc định ở mọi shop, không phải tính năng để quảng bá.** Không có mục "shop có trợ lý", bộ lọc, nhãn, banner về trợ lý; ô tìm kiếm toàn sàn không có mic. Trợ lý chỉ xuất hiện trong trang shop, trang sản phẩm và trang đơn hàng.
6. **Panel trợ lý trên web hiển thị đúng các trạng thái của sheet mobile** (đang nghe, đang tra, trả lời kèm card, ngắt lời, đọc lại chờ “đồng ý”, báo giá + chạm xác nhận…). Các trạng thái chỉ vẽ một lần ở trang mobile.
7. **Quy tắc hành động.** Thay đổi giỏ hàng cần người mua nói “đồng ý” sau khi trợ lý đọc lại; đặt đơn và mở trả hàng phải chạm thẻ xác nhận (theo `AGENTS.md` mục 13).
8. **Nguồn dữ liệu ghi kín đáo.** Dữ liệu từ tool là sự thật; tóm tắt của mô hình chỉ có nhãn chữ nhỏ "Suy luận AI".

## Token chính

| Vai trò | Người mua | Người bán |
| --- | --- | --- |
| Nền trang | `#f5f5f5` | `#f6f6f6` |
| Chữ / chữ phụ | `#222222` / `#595959` | `#222222` / `#595959` |
| Nhấn (nút chính, mục đang chọn, giá) | `#d9381a` | `#d9381a` |
| Link | — | `#2673dd` |
| Viền | `#ebebeb`, `#e0e0e0`, `#f2f2f2` | `#f0f0f0`, `#f5f5f5` |
| Thành công | `#0f7a4a` (chữ), `#16a34a` (chấm) | như bên mua |
| Font | Be Vietnam Pro, 14px, số tabular | như bên mua |

`#d9381a` thay `#ee4d2d` hiện tại vì chữ trắng trên `#ee4d2d` chỉ đạt 3,7:1.

## Dữ liệu và ảnh

Giá, tồn kho, voucher, phí ship theo seed demo; số liệu hội thoại, insights, ticket là dữ liệu mẫu ghi trong `specs/`. Ảnh sản phẩm là ảnh seed trong `apps/api/prisma/seed-images` (Wikimedia Commons, CC BY / CC BY-SA / CC0; tác giả trong `credits.json` cùng thư mục).

## Mục lục màn theo luồng

### Người mua · Mobile web

| Màn | File | Ảnh |
| --- | --- | --- |
| B1.1 · Trang chủ | [`m-B1-1.dc.html`](screens/m-B1-1.dc.html) | [ảnh](screenshots/m-B1-1.jpg) |
| B1.2 · Tìm kiếm | [`m-B1-2.dc.html`](screens/m-B1-2.dc.html) | [ảnh](screenshots/m-B1-2.jpg) |
| B1.3 · Kết quả tìm kiếm | [`m-B1-3.dc.html`](screens/m-B1-3.dc.html) | [ảnh](screenshots/m-B1-3.jpg) |
| B1.4 · Bộ lọc | [`m-B1-4.dc.html`](screens/m-B1-4.dc.html) | [ảnh](screenshots/m-B1-4.jpg) |
| B2.1 · Trang shop | [`m-B2-1.dc.html`](screens/m-B2-1.dc.html) | [ảnh](screenshots/m-B2-1.jpg) |
| B2.2 · Mở trợ lý từ trang shop | [`m-B2-2.dc.html`](screens/m-B2-2.dc.html) | [ảnh](screenshots/m-B2-2.jpg) |
| B3.1 · Sản phẩm + thanh trợ lý | [`MobileProduct.dc.html`](screens/MobileProduct.dc.html) | [ảnh](screenshots/MobileProduct.jpg) |
| B3.2 · Đang nghe | [`m-B3-2.dc.html`](screens/m-B3-2.dc.html) | [ảnh](screenshots/m-B3-2.jpg) |
| B3.3 · Đang tra dữ liệu | [`m-B3-3.dc.html`](screens/m-B3-3.dc.html) | [ảnh](screenshots/m-B3-3.jpg) |
| B3.4 · Trả lời kèm card | [`MobileAnswer.dc.html`](screens/MobileAnswer.dc.html) | [ảnh](screenshots/MobileAnswer.jpg) |
| B3.5 · Ngắt lời | [`m-B3-5.dc.html`](screens/m-B3-5.dc.html) | [ảnh](screenshots/m-B3-5.jpg) |
| B4.1 · Tư vấn theo nhu cầu | [`m-B4-1.dc.html`](screens/m-B4-1.dc.html) | [ảnh](screenshots/m-B4-1.jpg) |
| B4.2 · Không có lựa chọn phù hợp | [`m-B4-2.dc.html`](screens/m-B4-2.dc.html) | [ảnh](screenshots/m-B4-2.jpg) |
| B5.1 · So sánh trong hội thoại | [`m-B5-1.dc.html`](screens/m-B5-1.dc.html) | [ảnh](screenshots/m-B5-1.jpg) |
| B5.2 · Bảng so sánh đầy đủ | [`m-B5-2.dc.html`](screens/m-B5-2.dc.html) | [ảnh](screenshots/m-B5-2.jpg) |
| B6.1 · Đọc lại, chờ “đồng ý” | [`m-B6-1.dc.html`](screens/m-B6-1.dc.html) | [ảnh](screenshots/m-B6-1.jpg) |
| B6.2 · Đổi số lượng | [`m-B6-2.dc.html`](screens/m-B6-2.dc.html) | [ảnh](screenshots/m-B6-2.jpg) |
| B6.3 · Đã thêm vào giỏ | [`m-B6-3.dc.html`](screens/m-B6-3.dc.html) | [ảnh](screenshots/m-B6-3.jpg) |
| B7.1 · Báo giá + chạm xác nhận | [`m-B7-1.dc.html`](screens/m-B7-1.dc.html) | [ảnh](screenshots/m-B7-1.jpg) |
| B7.2 · Đặt hàng thành công | [`m-B7-2.dc.html`](screens/m-B7-2.dc.html) | [ảnh](screenshots/m-B7-2.jpg) |
| B7.3 · Giỏ hàng | [`m-B7-3.dc.html`](screens/m-B7-3.dc.html) | [ảnh](screenshots/m-B7-3.jpg) |
| B7.4 · Thanh toán | [`m-B7-4.dc.html`](screens/m-B7-4.dc.html) | [ảnh](screenshots/m-B7-4.jpg) |
| B7.5 · Đặt thành công (đơn tự đặt) | [`m-B7-5.dc.html`](screens/m-B7-5.dc.html) | [ảnh](screenshots/m-B7-5.jpg) |
| B8.1 · Đơn mua | [`m-B8-1.dc.html`](screens/m-B8-1.dc.html) | [ảnh](screenshots/m-B8-1.jpg) |
| B8.2 · Chi tiết đơn đang giao | [`m-B8-2.dc.html`](screens/m-B8-2.dc.html) | [ảnh](screenshots/m-B8-2.jpg) |
| B8.3 · Hỏi trợ lý về đơn | [`m-B8-3.dc.html`](screens/m-B8-3.dc.html) | [ảnh](screenshots/m-B8-3.jpg) |
| B9.1 · Kiểm tra điều kiện trả hàng | [`m-B9-1.dc.html`](screens/m-B9-1.dc.html) | [ảnh](screenshots/m-B9-1.jpg) |
| B9.2 · Quá hạn trả hàng | [`m-B9-2.dc.html`](screens/m-B9-2.dc.html) | [ảnh](screenshots/m-B9-2.jpg) |
| B9.3 · Điền yêu cầu trả hàng | [`m-B9-3.dc.html`](screens/m-B9-3.dc.html) | [ảnh](screenshots/m-B9-3.jpg) |
| B9.4 · Theo dõi yêu cầu | [`m-B9-4.dc.html`](screens/m-B9-4.dc.html) | [ảnh](screenshots/m-B9-4.jpg) |
| B10.1 · Trợ lý đề nghị chuyển cho shop | [`m-B10-1.dc.html`](screens/m-B10-1.dc.html) | [ảnh](screenshots/m-B10-1.jpg) |
| B10.2 · Đã gửi câu hỏi | [`m-B10-2.dc.html`](screens/m-B10-2.dc.html) | [ảnh](screenshots/m-B10-2.jpg) |
| B10.3 · Danh sách tin nhắn | [`m-B10-3.dc.html`](screens/m-B10-3.dc.html) | [ảnh](screenshots/m-B10-3.jpg) |
| B10.4 · Shop trả lời | [`m-B10-4.dc.html`](screens/m-B10-4.dc.html) | [ảnh](screenshots/m-B10-4.jpg) |
| B11.1 · Phản hồi cuối phiên | [`m-B11-1.dc.html`](screens/m-B11-1.dc.html) | [ảnh](screenshots/m-B11-1.jpg) |
| B11.2 · Chưa giải quyết + lý do | [`m-B11-2.dc.html`](screens/m-B11-2.dc.html) | [ảnh](screenshots/m-B11-2.jpg) |
| B11.3 · Lịch sử hội thoại | [`m-B11-3.dc.html`](screens/m-B11-3.dc.html) | [ảnh](screenshots/m-B11-3.jpg) |
| B12.1 · Tôi | [`m-B12-1.dc.html`](screens/m-B12-1.dc.html) | [ảnh](screenshots/m-B12-1.jpg) |
| B12.2 · Đăng nhập | [`m-B12-2.dc.html`](screens/m-B12-2.dc.html) | [ảnh](screenshots/m-B12-2.jpg) |
| B12.3 · Chưa cấp quyền micro | [`m-B12-3.dc.html`](screens/m-B12-3.dc.html) | [ảnh](screenshots/m-B12-3.jpg) |
| B12.4 · Trợ lý đang bận | [`m-B12-4.dc.html`](screens/m-B12-4.dc.html) | [ảnh](screenshots/m-B12-4.jpg) |
| B12.5 · Hội thoại tiếng Anh | [`m-B12-5.dc.html`](screens/m-B12-5.dc.html) | [ảnh](screenshots/m-B12-5.jpg) |

### Người mua · Web

| Màn | File | Ảnh |
| --- | --- | --- |
| B1 · Trang chủ | [`BuyerHome.dc.html`](screens/BuyerHome.dc.html) | [ảnh](screenshots/BuyerHome.jpg) |
| B1 · Kết quả tìm kiếm | [`w-B1-search.dc.html`](screens/w-B1-search.dc.html) | [ảnh](screenshots/w-B1-search.jpg) |
| B3 · Sản phẩm + trợ lý ghim | [`Main.dc.html`](screens/Main.dc.html) | [ảnh](screenshots/Main.jpg) |
| B2/B4 · Trang shop + trợ lý tư vấn | [`w-B4.dc.html`](screens/w-B4.dc.html) | [ảnh](screenshots/w-B4.jpg) |
| B5 · So sánh đầy đủ | [`w-B5.dc.html`](screens/w-B5.dc.html) | [ảnh](screenshots/w-B5.jpg) |
| B6–B7 · Giỏ hàng | [`w-B7-cart.dc.html`](screens/w-B7-cart.dc.html) | [ảnh](screenshots/w-B7-cart.jpg) |
| B7 · Thanh toán | [`w-B7-checkout.dc.html`](screens/w-B7-checkout.dc.html) | [ảnh](screenshots/w-B7-checkout.jpg) |
| B7 · Đặt hàng thành công | [`w-B7-done.dc.html`](screens/w-B7-done.dc.html) | [ảnh](screenshots/w-B7-done.jpg) |
| B8 · Đơn mua | [`w-B8-list.dc.html`](screens/w-B8-list.dc.html) | [ảnh](screenshots/w-B8-list.jpg) |
| B8 · Chi tiết đơn đang giao | [`w-B8-detail.dc.html`](screens/w-B8-detail.dc.html) | [ảnh](screenshots/w-B8-detail.jpg) |
| B9 · Chi tiết đơn + trợ lý hậu mãi | [`w-B9-order.dc.html`](screens/w-B9-order.dc.html) | [ảnh](screenshots/w-B9-order.jpg) |
| B9 · Yêu cầu trả hàng | [`w-B9-return.dc.html`](screens/w-B9-return.dc.html) | [ảnh](screenshots/w-B9-return.jpg) |
| B9 · Theo dõi yêu cầu trả hàng | [`w-B9-status.dc.html`](screens/w-B9-status.dc.html) | [ảnh](screenshots/w-B9-status.jpg) |
| B10 · Tin nhắn từ shop | [`w-B10.dc.html`](screens/w-B10.dc.html) | [ảnh](screenshots/w-B10.jpg) |
| B11 · Hội thoại với trợ lý | [`w-B11.dc.html`](screens/w-B11.dc.html) | [ảnh](screenshots/w-B11.jpg) |
| B12 · Đăng nhập | [`w-B12-login.dc.html`](screens/w-B12-login.dc.html) | [ảnh](screenshots/w-B12-login.jpg) |

### Kênh Người Bán · Web

| Màn | File | Ảnh |
| --- | --- | --- |
| S1.1 · Đăng ký người bán | [`s-S1-1.dc.html`](screens/s-S1-1.dc.html) | [ảnh](screenshots/s-S1-1.jpg) |
| S1.2 · Tạo shop | [`s-S1-2.dc.html`](screens/s-S1-2.dc.html) | [ảnh](screenshots/s-S1-2.jpg) |
| S1.3 · Cho phép kết nối | [`s-S1-3.dc.html`](screens/s-S1-3.dc.html) | [ảnh](screenshots/s-S1-3.jpg) |
| S2 · Tổng quan | [`SellerHome.dc.html`](screens/SellerHome.dc.html) | [ảnh](screenshots/SellerHome.jpg) |
| S3.1 · Đơn hàng | [`s-S3-1.dc.html`](screens/s-S3-1.dc.html) | [ảnh](screenshots/s-S3-1.jpg) |
| S3.2 · Chi tiết đơn | [`s-S3-2.dc.html`](screens/s-S3-2.dc.html) | [ảnh](screenshots/s-S3-2.jpg) |
| S3.3 · Giao hàng | [`s-S3-3.dc.html`](screens/s-S3-3.dc.html) | [ảnh](screenshots/s-S3-3.jpg) |
| S3.4 · Huỷ đơn | [`s-S3-4.dc.html`](screens/s-S3-4.dc.html) | [ảnh](screenshots/s-S3-4.jpg) |
| S4.1 · Sản phẩm | [`s-S4-1.dc.html`](screens/s-S4-1.dc.html) | [ảnh](screenshots/s-S4-1.jpg) |
| S4.2 · Biến thể, giá, tồn kho | [`s-S4-2.dc.html`](screens/s-S4-2.dc.html) | [ảnh](screenshots/s-S4-2.jpg) |
| S4.3 · Thông số có cấu trúc | [`s-S4-3.dc.html`](screens/s-S4-3.dc.html) | [ảnh](screenshots/s-S4-3.jpg) |
| S5.1 · Trả hàng / Hoàn tiền | [`s-S5-1.dc.html`](screens/s-S5-1.dc.html) | [ảnh](screenshots/s-S5-1.jpg) |
| S5.2 · Chi tiết yêu cầu | [`s-S5-2.dc.html`](screens/s-S5-2.dc.html) | [ảnh](screenshots/s-S5-2.jpg) |
| S6.1 · Mã giảm giá | [`s-S6-1.dc.html`](screens/s-S6-1.dc.html) | [ảnh](screenshots/s-S6-1.jpg) |
| S6.2 · Tạo mã giảm giá | [`s-S6-2.dc.html`](screens/s-S6-2.dc.html) | [ảnh](screenshots/s-S6-2.jpg) |
| S6.3 · Chiến dịch | [`s-S6-3.dc.html`](screens/s-S6-3.dc.html) | [ảnh](screenshots/s-S6-3.jpg) |
| S7.1 · Hộp thư | [`SellerInbox.dc.html`](screens/SellerInbox.dc.html) | [ảnh](screenshots/SellerInbox.jpg) |
| S7.2 · Tạo FAQ từ câu trả lời | [`s-S7-2.dc.html`](screens/s-S7-2.dc.html) | [ảnh](screenshots/s-S7-2.jpg) |
| S7.3 · FAQ | [`s-S7-3.dc.html`](screens/s-S7-3.dc.html) | [ảnh](screenshots/s-S7-3.jpg) |
| S8.1 · Hội thoại | [`SellerConversations.dc.html`](screens/SellerConversations.dc.html) | [ảnh](screenshots/SellerConversations.jpg) |
| S8.2 · Chi tiết hội thoại | [`s-S8-2.dc.html`](screens/s-S8-2.dc.html) | [ảnh](screenshots/s-S8-2.jpg) |
| S9.1 · Insights | [`SellerInsights.dc.html`](screens/SellerInsights.dc.html) | [ảnh](screenshots/SellerInsights.jpg) |
| S9.2 · Nhu cầu và hàng thiếu | [`s-S9-2.dc.html`](screens/s-S9-2.dc.html) | [ảnh](screenshots/s-S9-2.jpg) |
| S9.3 · Câu trợ lý chưa trả lời được | [`s-S9-3.dc.html`](screens/s-S9-3.dc.html) | [ảnh](screenshots/s-S9-3.jpg) |
| S10.1 · Cấu hình trợ lý | [`s-S10-1.dc.html`](screens/s-S10-1.dc.html) | [ảnh](screenshots/s-S10-1.jpg) |
| S10.2 · Thử trợ lý | [`s-S10-2.dc.html`](screens/s-S10-2.dc.html) | [ảnh](screenshots/s-S10-2.jpg) |
