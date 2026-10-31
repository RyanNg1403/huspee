# Đợt 2 — spec chung cho mọi agent

Các màn nằm trong `docs/design/frontend-redesign/screens/`.
Công cụ xem trước: `node docs/design/frontend-redesign/tools/render.mjs <file> <w> <h|full> <out.png>` chạy từ gốc repo.

## Quy tắc bắt buộc

- Định dạng `.dc.html` như các file đã có (xem `SellerHome.dc.html`, `MobileAnswer.dc.html`, `MobileProduct.dc.html`): dòng `<script src="./support.js"></script>` giữ nguyên, `<x-dc>` + `<helmet>` (Google Fonts Be Vietnam Pro + style body/a/button), khối `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":W,"height":H}}'>` với `class Component extends DCLogic`. Đóng mọi thẻ, quote mọi thuộc tính (boolean viết `disabled=""`, `checked=""`). SVG con viết `<path ...></path>`, không tự đóng.
- **Không đặt `<sc-for>` bên trong `<table>/<tbody>/<tr>`** (parser HTML sẽ đẩy ra ngoài). Hàng bảng viết tay, hoặc dùng div grid nếu cần lặp.
- Ảnh: chỉ dùng url `/_blob/<id>` dưới đây, viết thẳng trong `src`. Không data URI.
- Icon: SVG nét inline (stroke 1.7–2), không emoji. Icon trang trí có `aria-hidden="true"`; nút chỉ có icon phải có `aria-label`.
- Mobile: khung cố định 390×844, root `width: 390px; height: 844px; position: relative; overflow: hidden`. Desktop: trang fluid (không đặt width px cho root), container `max-width`, `flex-wrap` để co được.
- Link giữa các màn: `<a href="<file>.dc.html">` theo đúng thứ tự luồng (màn trước dẫn sang màn sau, nút quay lại dẫn về màn trước). Tên file theo manifest.
- Sau khi viết mỗi file: render, **mở ảnh ra xem**, sửa lỗi chồng chữ, xuống dòng xấu, tràn ngang, khoảng trống thừa. Chỉ coi xong khi ảnh sạch.

## Chống "slop" (người dùng đã chê bản đầu)

Không: pill màu cho mọi nhãn, khối nào cũng là card viền + tiêu đề + dòng chữ xám giải thích, câu chào kiểu chatbot, biểu đồ trang trí, hộp tím "AI", chú thích màu lặp ở từng khối, nhiều màu nhấn. Có: một màu nhấn `#d9381a`, số liệu màu chữ thường, trạng thái = chấm nhỏ + chữ, tiêu đề ngắn, bảng gọn, mật độ thông tin như Shopee / Shopee Seller Centre. Nguồn dữ liệu chỉ ghi kín đáo (chữ xám 12px). "Suy luận AI" chỉ là nhãn chữ nhỏ.

## Token

Buyer (mobile + web): nền trang `#f5f5f5`; mặt `#ffffff`; chữ `#222222`; chữ phụ `#595959`; chữ phụ nhạt `#757575` (chỉ trên nền trắng); viền `#ebebeb` / `#e0e0e0` / `#f2f2f2`; nhấn `#d9381a`; nền nhấn nhạt `#fff1ec`, vòng mic `#fde3db`; thành công `#0f7a4a` (chữ) `#16a34a` (chấm); cảnh báo chữ `#8a5300` trên `#fff4e0`. Avatar shop TechZone `#1e88e5` chữ "TZ". Font 14px, line-height 1.45, `font-variant-numeric: tabular-nums`. Nút chính nền `#d9381a` chữ trắng, bo 2–4px; nút phụ viền `#d9381a` chữ `#d9381a`; nút trung tính viền `#e0e0e0`. Giá: `<span style="font-size: 12px;">₫</span>18.490.000` màu nhấn; trong câu văn viết `18.490.000₫`.

Seller web: copy nguyên header + sidebar từ `SellerHome.dc.html` (đổi mục đang chọn: chữ `#d9381a` đậm, có `aria-current="page"`). Nền `#f6f6f6`; khối trắng bo 4px, `box-shadow: 0 1px 3px rgba(0,0,0,0.06)`, padding 20px 24px, không viền; tiêu đề khối 18px/600; tiêu đề trang 20px/600 ở đầu nội dung; chữ `#222222`, phụ `#595959`; link `#2673dd`; số 0 màu `#8a8a8a`; bảng: header 13px `#595959` weight 500, viền dưới `#f0f0f0`, hàng viền `#f5f5f5`, padding ô 12px.

## Khung trợ lý (mobile sheet — đã duyệt ở B3.4, copy từ `MobileAnswer.dc.html`)

Nền ảnh sản phẩm mờ (opacity .5 trên đen); sheet trắng `top` khoảng 200px (tăng/giảm tùy nội dung), bo 16px trên, thanh kéo; hàng đầu: avatar TZ 32px, "Trợ lý TechZone", dòng trạng thái (Đang nghe / Đang tra… / Đang nói / Chờ bạn chạm…); nút lịch sử + thu nhỏ. Hàng "Đang xem" nền `#f5f5f5` bo 8 + ảnh 28px + nút ×. Bong bóng người mua nền `#d9381a` chữ trắng bo `16 16 4 16` + "Bạn nói · 14:30" 11px `#757575`. Dòng tool: chữ `#595959` 12px + dấu tick xanh `#0f7a4a` (đang chạy: vòng quay xám). Bong bóng trợ lý nền `#f2f2f2` bo `16 16 16 4`. Card viền `#ebebeb` bo 8. Chip gợi ý cao 32 viền `#e0e0e0` bo 16. Chân: nút bàn phím trái, mic 64px giữa (vòng `#fde3db`), "Kết thúc" phải, chú thích dưới mic.

Trên **web**, panel bên phải (`Main.dc.html`) hiển thị đúng các trạng thái của sheet mobile; không cần vẽ lại từng trạng thái panel, chỉ vẽ trang web nào có bố cục khác.

## Dữ liệu (theo seed, giữ nhất quán)

Hôm nay 31/10/2026, khoảng 14:50. Người mua: Nguyễn Văn An (0901234567, 12 Nguyễn Huệ, P. Bến Nghé, Q.1, TP. HCM). Shop TechZone Official (Hà Nội, ★4.5, 6 sản phẩm), seller Phạm Quốc Huy. Người mua khác: Trần Thị Bình (Hà Nội), Lê Minh Cường (Đà Nẵng).

| Sản phẩm | Biến thể / giá / tồn | Cân nặng |
| --- | --- | --- |
| iPhone 15 128GB | Đen 18.490.000 (gốc 19.990.000) còn 25; Hồng 18.490.000 còn 12; Xanh dương 19.990.000 hết hàng | 0,4kg |
| Galaxy A55 5G | Xanh Navy 128GB 9.490.000 còn 30; Navy 256GB 10.490.000 còn 18; Tím Lilac 128GB 9.490.000 còn 22; Lilac 256GB 10.490.000 còn 3. Pin 5000mAh, 50MP OIS, Super AMOLED 120Hz, IP67, RAM 8GB | 0,45kg |
| Redmi Buds 5 | 790.000 (gốc 990.000) còn 150; chống ồn 46dB, pin 40 giờ, BT 5.3 | 0,15kg |
| Anker 65W GaN 3 cổng | 890.000 còn 80 | 0,2kg |
| Vivobook 15 OLED i5 16GB 512GB | 16.490.000 còn 9 | 2,3kg |
| Logitech M331 Silent Plus | 349.000; Đen còn 200, Đỏ còn 45, Xanh còn 4 | 0,12kg |

iPhone 15: shop chưa nhập pin, màn hình, RAM, kháng nước → hiển thị "Chưa có thông tin". Voucher: TECH50K giảm 50.000 cho đơn từ 500.000; TECH10 giảm 10% tối đa 300.000 cho đơn từ 2.000.000. Vận chuyển SPX Express 16.500 + 5.000/kg, 2–4 ngày (ước tính), có COD; Hỏa tốc Ninja Van 35.000 + 8.000/kg, trong ngày, không COD. Miễn phí vận chuyển cho đơn từ 500.000. Đổi trả 7 ngày nếu lỗi nhà sản xuất, còn tem/hộp/phụ kiện. Bảo hành chính hãng 12 tháng.

Kịch bản: đơn qua trợ lý `2610313W03F1` Galaxy A55 Navy 256GB × 1, TECH10, COD, tổng 10.190.000 (ship 18.750 → 0). Đơn trả hàng được: `261028K7Q1A2` Redmi Buds 5 giao 28/10, hạn trả hết 04/11 (còn 4 ngày). Đơn quá hạn: `261019D4MX05` Logitech M331 Đen giao 19/10, hạn trả hết 26/10. Thêm giỏ bằng giọng nói: Logitech M331 Đỏ × 1 → người mua đổi thành × 2 (698.000; đủ TECH50K và freeship). Handoff: An hỏi "Shop có gói quà không?" 14:33, shop trả lời 15:10 "Chào bạn, shop có gói quà miễn phí. Bạn ghi chú “gói quà” khi đặt hàng là được nhé."; Bình hỏi gói quà 13:52 (chờ trả lời); Cường hỏi "Mua 2 iPhone có được giảm thêm không?" 12:20 (cần shop quyết định). Insights 30 ngày: 148 hội thoại, 96 người mua, 14 đơn qua trợ lý (38.620.000₫), đã giải quyết 71/86 phản hồi, 62 chưa phản hồi, 11 chuyển cho shop, 23 lượt chưa trả lời được gộp thành 6 câu; phễu 148 → hỏi sản phẩm cụ thể 112 → xem báo giá 41 → xác nhận giỏ 26 → đặt đơn 14; hội thoại/ngày 02–31/10: 2,3,2,3,2,4,6,8,11,7,5,4,2,4,2,4,2,3,5,4,5,5,4,4,6,5,9,7,8,12 (Sale 10.10 là 08–12/10). Nhu cầu: iPhone 15 hỏi 41/hiển thị 63 (Đen 18, Xanh dương 14 hết hàng, Hồng 6); Galaxy A55 33/52 (Lilac 256GB 12 còn 3, Navy 256GB 9); Redmi Buds 5 21/40; Vivobook 9/14; Logitech M331 6/22 (Đỏ 3, Xanh 2); Anker 2/18. Hàng thiếu: iPhone 15 Xanh dương hết hàng 14 lượt/11 người; Galaxy A55 512GB không bán 5/5; Redmi Buds 5 trắng không bán 3/3. Chưa trả lời được: pin iPhone 15 (9), gói quà (5), trả góp 0% (4), Vivobook có cài sẵn Office không (3), bảo hành 1 đổi 1 (1), giao giờ hành chính (1). FAQ đang bật hiện có (mẫu): "Shop có xuất hóa đơn VAT không?", "Bảo hành ở đâu?".

