# Đợt 3 — bổ sung cho PHASE2_SPEC.md

Mọi quy tắc, token, khung trợ lý, dữ liệu và cách render trong `PHASE2_SPEC.md` vẫn áp dụng. Đọc file đó trước. Mẫu phong cách đã duyệt: `MobileProduct`, `MobileAnswer`, `m-B7-3`, `m-B10-3` (mobile); `Main`, `w-B7-cart`, `w-B11` (buyer web); `SellerHome`, `SellerInbox`, `s-S7-3` (seller web). Copy header/sidebar/thanh tab từ các file đó.

## Quy tắc mới từ phản hồi của người dùng

Người dùng đã tự xoá các câu giải thích trên bản cũ ("Nói “đồng ý” không đặt được đơn — bạn cần chạm", "— còn 4 ngày" sau hạn chót, "Không bắt buộc. Bạn có thể sửa lại trong Lịch sử", "Đây là hộp thư, không phải chat trực tiếp…"). **Không viết câu giải thích cách UI hoạt động, câu trấn an, câu chú thích dưới nút/ô.** Chỉ ghi dữ kiện và nhãn. Tiêu đề ngắn.

## Link điều hướng chung (dùng đúng tên file)

Seller sidebar: Tổng quan → `SellerHome.dc.html`; Đơn hàng › Tất cả và Chờ lấy hàng → `s-S3-1.dc.html`; Trả hàng / Hoàn tiền → `s-S5-1.dc.html`; Sản phẩm › Tất cả sản phẩm → `s-S4-1.dc.html`; Thêm sản phẩm → `s-S4-2.dc.html`; Khuyến mãi › Mã giảm giá → `s-S6-1.dc.html`; Chiến dịch → `s-S6-3.dc.html`; Trợ lý ảo › Hộp thư → `SellerInbox.dc.html`; Hội thoại → `SellerConversations.dc.html`; Insights → `SellerInsights.dc.html`; FAQ → `s-S7-3.dc.html`; Thử trợ lý → `s-S10-2.dc.html`; Cấu hình → `s-S10-1.dc.html`; Cửa hàng › Hồ sơ shop → `#`; Kết nối & ủy quyền → `s-S1-3.dc.html`; Xem shop trên Huspee → `w-B4.dc.html`.

Buyer web header: logo → `BuyerHome.dc.html`; giỏ → `w-B7-cart.dc.html`; tin nhắn → `w-B10.dc.html`; tên tài khoản → `w-B8-list.dc.html`. Menu tài khoản web: Đơn mua → `w-B8-list.dc.html`; Tin nhắn → `w-B10.dc.html`; Hội thoại với trợ lý → `w-B11.dc.html`.

Buyer mobile thanh tab: Trang chủ → `m-B1-1.dc.html`; Tin nhắn → `m-B10-3.dc.html`; Giỏ hàng → `m-B7-3.dc.html`; Tôi → `m-B12-1.dc.html`.

## Dữ liệu thêm (nhất quán với đợt 2)

Đơn của Nguyễn Văn An tại TechZone: `2610313W03F1` Galaxy A55 Navy 256GB × 1, 10.190.000₫, COD, đặt qua trợ lý 31/10 14:39, **Chờ lấy hàng**; `261030H8VD21` Anker 65W × 1, 890.000₫, đặt 30/10 16:20, **Đang giao** (SPX, mã vận đơn SPXVN0613902418; hành trình: 30/10 16:20 đặt hàng → 31/10 08:10 shop giao cho SPX tại Hà Nội → 31/10 13:40 rời kho phân loại Hà Nội → dự kiến nhận 01–03/11, ước tính); `261028K7Q1A2` Redmi Buds 5 × 1, 790.000₫, **Đã giao** 28/10, đang có yêu cầu trả hàng `RT2610310012` (chờ shop duyệt, gửi 31/10 14:46); `261019D4MX05` Logitech M331 Đen × 1, 366.100₫ (349.000 + ship 17.100), **Đã giao** 19/10. Đơn tự đặt qua giỏ hàng (B7.4): `261031T5NQ63`, Logitech M331 Đỏ × 2 + Anker 65W × 1, 1.538.000₫, COD, SPX 2–4 ngày.

Đơn của shop TechZone hôm nay (khớp Tổng quan: 6 đơn, 13.624.100₫): 08:12 `261031M2KD90` Phạm Thu Hà · Logitech M331 Đen × 1 · 366.100₫ · Đang giao; 09:40 `261031F3ZA11` Lý Gia Bảo · Anker 65W × 1 · 890.000₫ · Đang giao; 10:05 `261031P8LQ27` Đỗ Minh Khoa · Redmi Buds 5 × 1 · 790.000₫ · Đang giao; 11:30 `261031K2HC19` Trần Thị Bình · Logitech M331 Đỏ × 2 · 648.000₫ · qua trợ lý · Đang giao; 13:15 `261031R6TB84` Lê Minh Cường · Redmi Buds 5 × 1 · 740.000₫ (TECH50K) · Đang giao; 14:39 `2610313W03F1` Nguyễn Văn An · Galaxy A55 Navy 256GB × 1 · 10.190.000₫ · qua trợ lý · Chờ lấy hàng. Tab đơn hàng seller: Tất cả · Chờ lấy hàng (1) · Đang giao · Đã giao · Đơn huỷ · Trả hàng/Hoàn tiền (1).

Trả hàng của shop: `RT2610310012` Nguyễn Văn An · Redmi Buds 5 · Hàng lỗi, không hoạt động · "Tai nghe bên trái bị rè" · 2 ảnh · 790.000₫ · Chờ duyệt (31/10 14:46, đơn giao 28/10, trong hạn 7 ngày); `RT2610240007` Trần Thị Bình · Logitech M331 Xanh · Giao sai màu · Đã hoàn tiền (mô phỏng) 26/10; `RT2610150003` Lê Minh Cường · Anker 65W · Không còn nhu cầu · Từ chối 16/10 (ngoài chính sách: chỉ nhận lỗi nhà sản xuất).

Sản phẩm (tồn kho theo biến thể trong PHASE2_SPEC): sắp hết = còn ≤ 10 → 3 biến thể: Galaxy A55 Lilac 256GB (3), Logitech M331 Xanh (4), Vivobook 15 (9). Hết hàng: iPhone 15 Xanh dương. Đã bán: iPhone 312, Galaxy 205, Redmi Buds 1.240, Anker 860, Vivobook 64, Logitech 2.100. Thông số có cấu trúc cho iPhone 15: đã có Dung lượng 128GB, Camera chính 48MP, Cổng sạc USB-C, Bảo hành 12 tháng; còn trống Dung lượng pin (người mua hỏi 9 lần), Kích thước màn hình (hỏi 4), RAM, Kháng nước.

Voucher: TECH50K "Giảm 50K đơn từ 500K", 01/10–30/11/2026, 1.000 lượt, đã dùng 132, đang diễn ra; TECH10 "Giảm 10% tối đa 300K, đơn từ 2tr", 01/10–30/11/2026, 200 lượt, đã dùng 40, đang diễn ra. Chiến dịch: Sale 10.10 (08–12/10/2026, đã kết thúc, dùng TECH10); 11.11 (09–12/11/2026, sắp diễn ra, chưa gắn voucher).

Trợ lý (cấu hình): đang bật; phong cách Thân thiện; giọng Spruce; lời chào VI "Xin chào! Tôi có thể giúp gì cho bạn tại TechZone Official?", EN "Hello! How can I help you at TechZone Official?"; câu hỏi gợi ý trên trang shop do seller chọn: "Shop có mã giảm giá nào?", "Phí và thời gian giao hàng?", "Đơn hàng của tôi đến đâu rồi?"; kết nối: do quản trị nền tảng quản lý, seller chỉ xem trạng thái "Đang hoạt động".

Seller mới cho luồng đăng ký S1: Nguyễn Hải Đăng, email dang.haiaudio@example.com, shop mới "Hải Đăng Audio" (TP. HCM, ngành Âm thanh). Ứng dụng xin quyền ở bước kết nối: "Huspee Seller Tools" (ứng dụng của nền tảng), quyền: xem và cập nhật sản phẩm, tồn kho, giá; xem và xử lý đơn hàng, vận chuyển, trả hàng; quản lý mã giảm giá.
