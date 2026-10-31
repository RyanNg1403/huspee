# Prompt cho phiên tiếp theo: code frontend theo thiết kế U0 bằng subagent Codex

Cách dùng: mở phiên Claude Code mới ở gốc repo và nói "Đọc `docs/FRONTEND_IMPLEMENTATION_PROMPT.md` và làm theo".

---

## 1. Vai trò

- **Bạn (Claude) là người điều phối và người review.** Bạn chia việc, viết brief, chạy các phiên Codex song song, đọc diff, chạy test, so giao diện với ảnh thiết kế, yêu cầu sửa, rồi gộp. Bạn chỉ tự sửa những chỗ nhỏ khi review; phần lớn code và test do Codex viết.
- **Codex là người viết code và test**, chạy qua Codex CLI với model `gpt-6-astra`, mức suy luận `xhigh` (extra high). Mỗi gói việc một phiên Codex, một git worktree riêng.
- Trao đổi với người dùng bằng tiếng Việt.

## 2. Đọc trước khi làm

1. `AGENTS.md` (đặc biệt mục 2, 5, 6, 13) và `BRIEF.md`.
2. `apps/web/AGENTS.md`: Next.js 16 có thay đổi phá vỡ; đọc tài liệu trong `node_modules/next/dist/docs/` trước khi viết code frontend. `apps/web/CONVENTIONS.md`.
3. `docs/FRONTEND_REDESIGN_PLAN_2026-10-31.md`: các bước U0–U3, quyết định đã chốt, nhật ký duyệt.
4. `docs/design/frontend-redesign/README.md`: 8 nguyên tắc đã chốt với người dùng, token, mục lục 84 màn. Xem ảnh trong `screenshots/` và số liệu trong `specs/`.
5. Nếu có trên máy (chưa đưa vào repo): `docs/FEATURE_COMPLETION_PLAN_2026-10-31.md` (các bước S0–S4, F1–F8 và quy trình dừng chờ người dùng test) và `docs/INVESTIGATION_2026-10-31.md` (các lỗi đã tái hiện). Nếu không có, hỏi người dùng.
6. `PHASE1_ENDPOINTS.md`, `docs/PLATFORM.md`, `docs/ASSISTANT.md`, `docs/VOICE.md` khi chạm vào phần liên quan.
7. **Đối chiếu với `develop` trước khi giao việc.** `develop` đã có thêm sau khi vẽ thiết kế:
   - catalog 80 sản phẩm với ảnh sinh mới;
   - trợ lý nhận sản phẩm đang xem (một phần F1);
   - một hội thoại xuyên suốt chữ và giọng;
   - mobile qua tunnel;
   - trang đăng nhập Codex công khai.

   Đọc `git log origin/main..origin/develop` và code liên quan. Không làm lại phần đã có. Số liệu trong `specs/` lấy từ seed cũ 15 sản phẩm. Khi viết fixture và test, dùng seed hiện hành; giữ bố cục và quy tắc của thiết kế, coi ID và giá trong ảnh chỉ là minh hoạ.

## 3. Phạm vi và thứ tự

Làm lần lượt **U1 → U2 → U3**, rồi **S1–S4, F1–F8** theo kế hoạch hoàn thiện tính năng, cuối cùng là **D1**. Quy tắc chung cho mọi bước:

- **Nhánh riêng cho mỗi bước.** Tạo `feat/<bước>-<tên ngắn>` từ `origin/develop`, mở PR vào `develop`.
- **Dừng sau mỗi bước** với trạng thái "CHỜ BẠN TEST". Không có phản hồi không có nghĩa là đã duyệt. Không gộp hai bước vào một PR.
- **Song song được trong một bước** khi các gói việc chạm vào file khác nhau.
- **Không làm UI giả cho phần backend chưa có.** Card hay trang nào cần backend của bước F thì để cho bước F đó.

Nội dung từng bước:

- **U1 (tách hai app, giao diện gần như giữ nguyên):**
  - Tạo `apps/seller-web` (Next 16, cổng 3002) từ `apps/web/src/app/seller/*`, bỏ tiền tố `/seller`.
  - Tạo `packages/web-ui` chỉ chứa code chạy được trên trình duyệt: tokens, UI primitives, i18n, format, session, API client, card trợ lý.
  - Tách session theo surface:
    - Seller Centre đăng nhập với `surface: seller` và gửi header `X-Huspee-Surface: seller`, nhận cookie `huspee_seller_sid`.
    - Mặc định vẫn là buyer, để giữ nguyên hợp đồng API và test cũ.
    - Trang consent Partner ưu tiên cookie seller nhưng vẫn nhận cookie cũ.
  - Cập nhật kèm theo: CORS cho 2 origin, thêm `SELLER_APP_URL` cho redirect OAuth, thêm service `seller-web` vào Docker Compose, cập nhật các script `smoke:*`, README và endpoint inventory.
  - Test cần có: buyer và seller đăng nhập cùng lúc trong một trình duyệt; cookie seller không gọi được route buyer và ngược lại; quyền sở hữu shop vẫn được kiểm tra.
- **U2 (Seller Centre trên dữ liệu đang có):** shell gồm header và sidebar nhóm, Tổng quan (S2), Hộp thư (S7.1), danh sách và chi tiết hội thoại (S8.1–S8.2). Đơn hàng, sản phẩm, trả hàng, mã giảm giá (S3–S6) làm theo thiết kế nếu backend đã có.
- **U3 (người mua, chỉ dùng các tool hiện có):**
  - Token mới và header.
  - Trang chủ, tìm kiếm, shop, sản phẩm.
  - Panel trợ lý ghim bên phải trên web, bottom sheet trên mobile, cùng các trạng thái B3.
  - Lối vào trợ lý theo ngữ cảnh: trang shop, trang sản phẩm, trang đơn hàng.

## 4. Gọi Codex

Thiết lập một lần mỗi phiên:

```bash
mkdir -p .codex-runs ../huspee-wt
grep -qx '.codex-runs/' .git/info/exclude || echo '.codex-runs/' >> .git/info/exclude
```

Cho mỗi gói việc (ví dụ bước `u1`, gói `web-ui`, chỉ số `N` để tránh trùng cổng và database):

```bash
STEP=u1; PKG=web-ui; N=1
WT=../huspee-wt/$STEP-$PKG; RUN=.codex-runs/$STEP-$PKG
git fetch origin develop
git worktree add -b feat/$STEP-$PKG "$WT" origin/develop
(cd "$WT" && pnpm install --frozen-lockfile)
createdb -h localhost -U huspee "huspee_test_${STEP}_${PKG//-/_}" 2>/dev/null || true   # database test riêng
mkdir -p "$RUN"   # viết brief vào $RUN/brief.md theo mẫu ở mục 5
codex exec \
  -m gpt-6-astra \
  -c model_reasoning_effort="xhigh" \
  -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -C "$WT" \
  --json -o "$RUN/last.md" \
  - < "$RUN/brief.md" > "$RUN/events.jsonl" 2>&1
```

- **Chạy nền.** Chạy bằng Bash với `run_in_background: true`. Khi phiên Codex xong bạn sẽ được báo, không cần poll.
- **Số phiên song song:** tối đa khoảng 4 phiên cùng lúc, vì hạn mức gói ChatGPT, CPU và Postgres.
- **Cổng và database test riêng cho mỗi worktree.** Bộ test tự bật API ở `TEST_API_PORT` (mặc định 3999) và dùng `TEST_DATABASE_URL`, nên mỗi brief phải ghi rõ, ví dụ `TEST_API_PORT=$((4000+N))`, `TEST_DATABASE_URL=postgresql://huspee:huspee@localhost:5432/huspee_test_<step>_<pkg>?schema=public`. Dev server của web cũng dùng cổng riêng.
- **Gửi kết quả review cho Codex:** lấy `thread_id` từ sự kiện `thread.started` trong `events.jsonl`, rồi chạy:
  `codex exec resume <thread_id> -m gpt-6-astra -c model_reasoning_effort="xhigh" -s workspace-write -c sandbox_workspace_write.network_access=true -C "$WT" --json -o "$RUN/last.md" - < "$RUN/review-1.md" >> "$RUN/events.jsonl" 2>&1`.
- **Khi model hoặc mức suy luận bị từ chối:** nếu `gpt-6-astra` hay `xhigh` không được chấp nhận, dừng lại và báo người dùng; không tự đổi model.
- **Không dùng** `--dangerously-bypass-approvals-and-sandbox`.
- **Gộp kết quả:** khi mọi gói của một bước đã qua review, gộp chúng vào nhánh của bước, chạy lại toàn bộ kiểm tra ở mục 6, rồi xoá worktree bằng `git worktree remove`.

## 5. Mẫu brief cho Codex

```markdown
# <Bước> · <Gói việc>

## Bối cảnh
Repo Huspee (Next.js 16 + NestJS + Prisma + pnpm). Đọc AGENTS.md, apps/web/AGENTS.md, apps/web/CONVENTIONS.md,
docs/design/frontend-redesign/README.md trước khi sửa. Tài liệu Next.js nằm trong node_modules/next/dist/docs/.

## Mục tiêu
<kết quả người dùng thấy được, 2–4 câu>

## Thiết kế liên quan
<đường dẫn ảnh trong docs/design/frontend-redesign/screenshots/ và file .dc.html tương ứng>

## Phạm vi
Được sửa: <thư mục/file>. Không được sửa: <thư mục/file của gói khác>, route Shopee-compatible, phương thức SDK upstream.

## Tiêu chí đạt
- <hành vi 1>
- <hành vi 2, gồm trạng thái loading/empty/error và tiếng Việt/tiếng Anh>

## Test phải viết
- Unit: <quy tắc>
- Integration với DB thật: <quyền, phiên, trường hợp lỗi>
- SDK/extension: <route mới>
- UI smoke (nếu có màn mới): <hành trình>

## Môi trường
TEST_API_PORT=<cổng>, TEST_DATABASE_URL=<url>; dev server web ở cổng <cổng>.

## Lệnh phải chạy và phải pass
pnpm typecheck · pnpm --filter <gói> lint · pnpm test (hoặc bộ liên quan) · pnpm build:web

## Ràng buộc
Không đọc, in, sao chép hay commit auth.json hoặc credential Codex; không sửa ~/.codex. Test không được gọi Codex thật.
Không viết câu giải thích cách UI hoạt động; không quảng bá trợ lý như tính năng. Token theo README thiết kế.

## Khi xong
Commit trong worktree theo Conventional Commits (không push). Trả lời cuối gồm: file đã đổi, lệnh đã chạy và
kết quả (số test pass/fail), việc còn dở, giả định đã đặt.
```

## 6. Review của Claude trước khi gộp

Với mỗi gói, đọc `git diff origin/develop...` trong worktree, tự chạy lại các lệnh kiểm tra, và kiểm tra theo danh sách sau:

- **Đúng và an toàn:**
  - Quyền và quyền sở hữu shop kiểm tra ở server, không tin `shop_id` từ client.
  - `partner_key` và token shop không lọt vào bundle trình duyệt; grep thư mục build để chắc.
  - Session tách đúng theo surface; cookie đặt HttpOnly, SameSite=Lax, Secure theo cấu hình; CORS chỉ cho 2 origin.
- **Hợp đồng API:**
  - Route Shopee-compatible và phương thức SDK upstream không đổi; bộ `test:upstream` không bị sửa và vẫn xanh.
  - Route mới có trong `PHASE1_ENDPOINTS.md` với provenance `custom`, kèm phương thức SDK có kiểu.
- **Test:**
  - Test kiểm tra hành vi, không chép lại code; có cả nhánh lỗi; có regression cho lỗi đã sửa; không gọi Codex thật.
  - Các lệnh `pnpm test`, `test:upstream`, `test:extensions`, `test:e2e`, `pnpm typecheck`, lint và build của cả hai app đều xanh. Ghi số liệu cụ thể.
- **Frontend:**
  - Theo `CONVENTIONS.md`: key tiếng Việt và tiếng Anh khớp nhau, dùng `useApi`, đủ trạng thái loading/empty/error, định dạng qua `@/lib/format`.
  - Ranh giới server/client component đúng; client không import code server-only.
  - Truy cập được: có label, role, điều khiển bằng bàn phím, độ tương phản từ 4,5:1.
  - Ở chiều rộng 390px không tràn ngang.
- **Khớp thiết kế:**
  - Tự chạy app (dev server ở cổng riêng), chụp màn bằng Playwright, đặt cạnh ảnh cùng màn trong `docs/design/frontend-redesign/screenshots/`.
  - Kiểm tra đủ 8 nguyên tắc trong README thiết kế, nhất là: không câu giải thích UI, không quảng bá trợ lý, đúng token.
- **Chất lượng code:** không dùng `any`, không code chết, không nhân bản component đã có trong `packages/web-ui`; module nhỏ và rõ việc; xử lý lỗi nhất quán; tên theo quy ước của repo.
- **Công cụ:** chạy skill `/code-review` mức high trên diff; thêm `/security-review` khi chạm vào auth, session hoặc ký request.

Có lỗi thì viết `review-<n>.md` ngắn: lỗi, vị trí, kỳ vọng. Gửi lại cho cùng phiên Codex (mục 4). Lặp đến khi đạt.

## 7. Bàn giao mỗi bước

- **Push và mở PR:** push nhánh của bước, `gh pr create --base develop`. Body PR gồm: tóm tắt, ảnh trước/sau, lệnh kiểm tra cùng kết quả, giới hạn còn lại.
- **Ghi nhật ký:** cập nhật bảng trạng thái và nhật ký duyệt trong `docs/FRONTEND_REDESIGN_PLAN_2026-10-31.md`.
- **Báo người dùng** bằng tiếng Việt: URL chạy local, tài khoản demo, 3–5 thao tác cần test, kết quả mong đợi, rồi dừng với "CHỜ BẠN TEST".

## 8. Ràng buộc luôn áp dụng

- Không đọc, in, sao chép hay commit `auth.json` hoặc bất kỳ credential Codex nào; không sửa `~/.codex`. Codex CLI dùng phiên đăng nhập sẵn có của người dùng.
- Không chạy phiên voice thật hay `pnpm eval:assistant` khi người dùng chưa yêu cầu.
- Giữ nguyên hợp đồng Phase 1 và toàn bộ test hiện có.
- Không đụng vào các thay đổi chưa commit trong thư mục làm việc chính của người dùng. Luôn làm trong worktree tách từ `origin/develop`.
- Không commit secret; `partner_key` chỉ nằm ở backend.
