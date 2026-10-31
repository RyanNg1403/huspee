# Kế hoạch tách và thiết kế lại frontend Huspee

**Trạng thái: ĐÃ ĐƯỢC NGƯỜI DÙNG DUYỆT (31/10/2026). U0 đã giao đủ 3 đợt (84 màn); chờ người dùng xem đợt 3 trước khi sang U1.**

Bổ sung cho kế hoạch hoàn thiện tính năng S0–S4, F1–F8 (`docs/FEATURE_COMPLETION_PLAN_2026-10-31.md`, hiện chỉ có trên máy của người dùng, chưa đưa vào repo): phần UI của từng bước F1–F8 làm theo bản thiết kế U0 và được xây vào shell mới sau U1–U3.

Bản thiết kế U0: canvas https://claude.ai/artifact/QDw9uznxZRBEoyPGw95u1v (chia sẻ trong tổ chức); bản lưu trong repo ở [`docs/design/frontend-redesign/`](design/frontend-redesign/README.md). Prompt cho phiên code tiếp theo: [`docs/FRONTEND_IMPLEMENTATION_PROMPT.md`](FRONTEND_IMPLEMENTATION_PROMPT.md).

## 1. Hiện trạng khi khảo sát

- Buyer và seller nằm chung một app Next.js, chung `/login`, chung cookie `huspee_sid`, CORS chỉ một origin. Seller seed có cả role BUYER, nên đăng nhập seller là đăng nhập luôn bên buyer; demo song song phải dùng 2 profile trình duyệt.
- Buyer: trợ lý là bong bóng nổi đè lên nội dung (desktop che giá, mobile chiếm cả màn); không biết sản phẩm/biến thể đang xem; gợi ý giống nhau ở mọi trang; thông số sản phẩm quá ít để so sánh; vận chuyển chỉ là đoạn chữ.
- Seller: Tổng quan chỉ có 4 KPI; sidebar 8 mục ngang hàng, Hộp thư tách khỏi Trợ lý; log hội thoại hiện mã hash và buyer "#1", không có kết quả hay phản hồi; Insights đếm cả sản phẩm chỉ xuất hiện trong kết quả, lặp dòng "hết hàng"; mọi seller quản lý được thẻ kết nối Codex dùng chung.

## 2. Tách hai site

| | Huspee (buyer) | Huspee Kênh Người Bán (seller) |
| --- | --- | --- |
| URL local | `localhost:3001` | `localhost:3002` |
| Code | `apps/web`, giữ route | `apps/seller-web`, chuyển từ `app/seller/*`, bỏ tiền tố `/seller` |
| Đăng nhập | `/login` | `/login` riêng, chỉ role seller |
| Session | cookie `huspee_sid` | cookie `huspee_seller_sid` |

- Dùng chung qua `packages/web-ui`: design tokens, UI primitives, i18n, format, session, API client, card trợ lý (seller xem lại hội thoại đúng như buyer thấy). Không import `@huspee/sdk/server`.
- Backend chọn cookie theo surface; mặc định buyer để giữ nguyên hợp đồng và test Phase 1. Seller Centre đăng nhập với `surface: seller` và gửi header surface; trang consent Partner ưu tiên cookie seller, vẫn nhận cookie cũ. Quyền và ownership vẫn kiểm tra ở server.
- Cập nhật kèm: CORS hai origin, `SELLER_APP_URL` cho redirect OAuth, service `seller-web` trong Docker Compose, `smoke:ui`, README, endpoint inventory.

## 3. Định hướng thiết kế

- Tham khảo các mẫu quen thuộc của sàn TMĐT Việt Nam: header cam có ô tìm kiếm, lưới danh mục, vé voucher, khối giá nền nhạt, hàng nhãn bên trái trên trang sản phẩm, thanh mua cố định trên mobile. Không dùng tên, logo hay tài sản thương hiệu của sàn khác.
- Màu chính đổi từ `#ee4d2d` sang `#d9381a`: chữ trắng trên `#ee4d2d` chỉ đạt 3,7:1, `#d9381a` đạt 4,6:1. Chữ phụ `#6b645f` để đạt 4,5:1 trên nền trang.
- Buyer: trợ lý ghim bên phải trên desktop (nội dung co lại, không bị che), bottom sheet trên mobile; chip "Đang xem"; gợi ý theo trang; dòng trạng thái tool; nhãn "Dữ liệu shop" trên card; "Chưa có thông tin" thay vì đoán.
- Seller: shell trung tính, sidebar nhóm Bán hàng / Trợ lý ảo / Cửa hàng; mỗi chỉ số ghi nguồn (Nhật ký, Người mua, Suy luận AI); mọi gợi ý dẫn về hội thoại gốc.

## 4. Các màn trong bản thiết kế U0

| Màn | Tính năng thể hiện |
| --- | --- |
| Trang sản phẩm + trợ lý ghim (desktop, chọn màu được) | F1, F2 (bản gọn) |
| Trang chủ | Lối vào trợ lý, shop có trợ lý, voucher/freeship từ seed |
| Mobile: sản phẩm, tư vấn, so sánh, báo giá + xác nhận chạm, hậu mãi + phản hồi, tin nhắn | F1–F6, handoff |
| Seller: Tổng quan | Việc cần làm, gợi ý có bằng chứng |
| Seller: Hội thoại | Kết quả quan sát, phản hồi buyer, transcript gắn ngữ cảnh, dữ liệu đã tra, đính chính, tóm tắt AI có nhãn |
| Seller: Insights | F7: phễu, phản hồi, xu hướng theo chiến dịch, hỏi cụ thể vs chỉ hiển thị, hàng thiếu, câu chưa trả lời |
| Seller: Hộp thư | F8: tạo FAQ từ câu trả lời, bỏ thông tin riêng, bản nháp/bật |

Giá, tồn kho, voucher và phí ship lấy theo seed; số liệu hội thoại là dữ liệu mẫu.

## 5. Thứ tự và trạng thái

| Bước | Nội dung | Trạng thái |
| --- | --- | --- |
| U0 | Bản thiết kế bấm được, không sửa code app | Đã giao bản đầu, chờ người dùng xem |
| U1 | Tách 2 app, `packages/web-ui`, session theo surface; giao diện gần như giữ nguyên, regression xanh | Đã giao PR, CHỜ NGƯỜI DÙNG TEST |
| U2 | Seller Centre: shell, Tổng quan, Hộp thư, Hội thoại trên dữ liệu hiện có | Chưa bắt đầu |
| U3 | Buyer: panel ghim/bottom sheet, trạng thái tool, nhãn dữ liệu, lối vào theo ngữ cảnh với tool hiện có | Chưa bắt đầu |
| Sau đó | S1–S4 rồi F1–F8 theo kế hoạch đã duyệt, mỗi bước F làm luôn UI theo U0, rồi D1 | Chưa bắt đầu |

Mỗi bước dừng chờ người dùng test như kế hoạch cũ. Không làm UI giả cho phần backend chưa có.

## 6. U0 mở rộng: toàn bộ luồng use case (duyệt 31/10/2026)

Người dùng đánh giá bản seller đầu tiên là "slop" (pill màu khắp nơi, khối nào cũng giống nhau, chữ giải thích thừa, biểu đồ trang trí, sidebar không nhất quán). Đã duyệt:

- Làm lại cả 4 màn seller desktop theo kiểu Seller Centre: trung tính, nhiều thông tin, một màu nhấn, số liệu màu chữ, trạng thái bằng chấm + chữ, cột chính + cột phải hẹp.
- Vẽ toàn bộ luồng use case: người mua cả **web** và **mobile web**; người bán **chỉ web** (bỏ seller mobile web theo yêu cầu ngày 31/10). Mỗi luồng một hàng trên canvas, các màn nối link để bấm Play đi hết luồng.
- Thêm ô "Thử trợ lý" trong Seller Centre.
- Trợ lý là mặc định ở mọi shop, không quảng bá như tính năng: không có mục "shop có trợ lý", bộ lọc, nhãn hay banner về trợ lý; ô tìm kiếm toàn sàn không có mic. Trợ lý chỉ xuất hiện trong trang shop, trang sản phẩm và trang đơn hàng.
- Agent tự dựng bản xem trên máy và chụp từng màn để soát trước khi giao.

Luồng người mua: B1 tìm sản phẩm · B2 vào shop · B3 hỏi về sản phẩm đang xem (F1) · B4 tư vấn (F3) · B5 so sánh (F2) · B6 thêm giỏ bằng giọng nói · B7 báo giá và đặt hàng (F4) · B8 theo dõi đơn · B9 trả hàng (F5) · B10 hỏi shop (handoff) · B11 phản hồi và lịch sử (F6) · B12 tài khoản và lỗi.

Luồng người bán: S1 bắt đầu bán · S2 tổng quan · S3 xử lý đơn · S4 sản phẩm · S5 trả hàng · S6 khuyến mãi · S7 hộp thư → FAQ (F8) · S8 hội thoại (F6) · S9 insights (F7) · S10 cấu hình và thử trợ lý.

| Đợt | Nội dung | Trạng thái |
| --- | --- | --- |
| 1 | Chốt phong cách: Tổng quan seller web, B3.1 và B3.4 mobile | Đã duyệt |
| 2 | Luồng chính cho demo: B3–B7, B9–B11 (buyer web + mobile web), S7–S9 (seller web), cùng 3 màn seller web còn lại | Đã giao |
| 3 | Luồng mua bán còn lại: B1, B2, B8, B12 (buyer web + mobile web), S1, S3–S6, S10 (seller web) | Đã giao, chờ xem |

## 7. Nhật ký duyệt

| Ngày | Bước | Kết quả | Phản hồi người dùng | Quyết định |
| --- | --- | --- | --- | --- |
| 2026-10-31 | Kế hoạch | Khảo sát 17 màn hình đang chạy, đọc layout/session | "Ok đồng ý", yêu cầu bản thiết kế tham khảo mẫu sàn TMĐT | Làm U0 |
| 2026-10-31 | U0 | 12 artboard trên canvas thiết kế | Dashboard seller "slop"; muốn đủ luồng use case web + mobile web | Làm lại theo mục 6 |
| 2026-10-31 | U0 đợt 1 | Tổng quan seller desktop (chọn chỉ số trên biểu đồ được), S2, B3.1, B3.4; đã chụp và soát từng màn | Kênh người bán không cần mobile web | Gỡ S2 mobile và trang seller mobile khỏi canvas; seller chỉ làm web |
| 2026-10-31 | U0 đợt 1 | — | "Ok chốt" | Sang đợt 2 |
| 2026-10-31 | U0 đợt 2 | Mỗi luồng một hàng trên canvas, nối link bấm Play; trên web panel trợ lý dùng chung trạng thái với sheet mobile; bỏ các câu giải thích người dùng đã tự xoá ở bản cũ; dời phiên hỏi gói quà sang 14:12 cho khỏi chồng giờ | Chờ phản hồi | Chưa sang đợt 3 |
| 2026-10-31 | U0 đợt 3 | 48 màn mới (15 mobile, 6 buyer web, 17 seller web, 10 sửa/nối link); giữ các sửa tay của người dùng trên 12 màn đợt 2 | Trang chủ quảng bá trợ lý là sai vì shop nào cũng có | Bỏ banner, mục, bộ lọc, nhãn, mic tìm kiếm toàn sàn; đăng lại; chờ phản hồi |
| 2026-10-31 | U1 | Tách `apps/seller-web` (3002) và `packages/web-ui`; session gắn surface ở backend (`X-Huspee-Surface`, `huspee_seller_sid`, migration `session_surface`), CORS 2 origin, `SELLER_APP_URL`; 267 test, smoke dual-session 18/18, build 2 app xanh | Ban đầu yêu cầu không sửa backend, sau đó cho sửa backend để tách 2 site; demo hackathon nên bỏ security review | Chờ người dùng test; U2/U3 làm song song trên nền U1 |
