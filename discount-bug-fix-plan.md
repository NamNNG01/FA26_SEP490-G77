# Discount bugs - vị trí và phương án sửa

## Phạm vi kiểm tra

Đã đối chiếu danh sách bug với mã nguồn hiện tại của BE và FE. File
`BE/src/main/java/com/examprep/ExamPrepBackendApplication.java` chỉ khởi động
Spring Boot và bật scheduling, không chứa logic discount nên không phải file cần
sửa cho các lỗi dưới đây.

## Tổng hợp ưu tiên

| # | Bug | Trạng thái trong checkout hiện tại | Ưu tiên |
|---|---|---|---|
| 1 | API assignments trả 500 khi không có keyword | Đã sửa và có regression test | P0 |
| 2 | Filter Fixed amount không tìm thấy `FIXED` | Đã thống nhất `FIXED_AMOUNT` | P0 |
| 3 | Filter Expired làm sai trang và crash FE | Đã sửa lọc trước khi phân trang | P0 |
| 4 | Contest dùng discount bị hiển thị sai | Đã sửa query theo discount id | P0 |
| 5 | `page < 0` hoặc `size <= 0` trả 500 | Đã validate và trả 400 | P1 |
| 6 | `appliesTo` nhận giá trị bất kỳ | Đã validate ở BE, FE và DB | P1 |
| 7 | Đọc toàn bộ bảng rồi lọc trong Java | Đã thay bằng query count/exists | P1 |
| 8 | Gõ search gửi request mỗi ký tự | Đã có debounce 300 ms | P2 |
| 9 | Đóng detail modal rồi modal tự mở lại | Đã có request-id guard | P2 |

## Chi tiết và phương án sửa

### 1. Assignments 500 khi keyword rỗng

**File/vị trí:**

- `BE/src/main/java/com/examprep/repositories/UserDiscountRepository.java:45-54`
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:284-288`

`AdminDiscountService` chuyển keyword rỗng thành `null`, sau đó JPQL vẫn gọi
`LOWER(:keyword)`. Với PostgreSQL, parameter null trong biểu thức này có thể
không suy ra được kiểu và bị bind như `bytea`.

**Đã sửa:**

1. `AdminDiscountService` truyền keyword rỗng thay vì `null`.
2. `UserDiscountRepository` kiểm tra `:keyword = ''` và dùng `COALESCE` cho
   tên/email null.
3. Test assignments có dữ liệu nhưng không truyền keyword đã được bổ sung.

### 2. Không lọc được discount Fixed amount

**File/vị trí:**

- `BE/src/main/resources/db/migration/V41__student_part2_core_tables.sql:85-94`
  ghi nhận dữ liệu cũ dùng `FIXED`.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:59-60`
  lọc bằng giá trị nhận từ request mà không normalize alias.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:316-321`
  chỉ chấp nhận `FIXED_AMOUNT` khi create/update.
- `FE/src/services/adminDiscount.service.ts:4,68-73` khai báo
  `FIXED_AMOUNT` là type của Admin API nhưng trước đây còn normalize ngầm
  response legacy `FIXED`.
- `FE/src/features/admin/pages/DiscountsPage.tsx:587-591` gửi `FIXED_AMOUNT`.

**Đã sửa:**

1. Dùng `FIXED_AMOUNT` làm giá trị duy nhất trong code hiện tại.
2. Cập nhật các row đang có `discount_type = 'FIXED'` trực tiếp trên Supabase
   thành `FIXED_AMOUNT`; không thêm logic legacy vào application.
3. Không normalize ngầm `FIXED` ở FE, để dữ liệu sai chuẩn lộ ra ngay khi test.
4. Kiểm tra các API contest/student dùng `discountType` và cập nhật type/format
   tương ứng, đặc biệt `FE/src/services/managerContest.service.ts:33-35`.
5. Test filter `FIXED_AMOUNT`, create và update dùng đúng canonical value.

Không sửa migration lịch sử để tự động chuyển dữ liệu production. Sau khi
update dữ liệu trực tiếp, có thể kiểm tra bằng:

```sql
update discounts
set discount_type = 'FIXED_AMOUNT'
where discount_type = 'FIXED';

select discount_id, code, discount_type
from discounts
where discount_type not in ('PERCENT', 'FIXED_AMOUNT');
```

### 3. Filter Expired phân trang sai và làm FE crash

**File/vị trí:**

- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:48-50`
  phân trang trước khi lọc validity.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:75-80`
  trả `null` cho các discount không khớp validity.
- `FE/src/features/admin/pages/DiscountsPage.tsx:409-413` map content thành rows;
  các component bảng sau đó có thể đọc field của phần tử null.

**Đã sửa:**

1. Lấy tập discount phù hợp, tính validity rồi lọc trước khi cắt trang.
2. Tính đúng các trạng thái:
   - `INACTIVE`: deleted hoặc `isActive = false`;
   - `UPCOMING`: `startAt > now`;
   - `EXPIRED`: `expiresAt <= now`;
   - `EXHAUSTED`: remaining `<= 0`;
   - `ACTIVE`: các trường hợp còn lại.
3. Với `EXHAUSTED/ACTIVE`, đưa số assignment chưa dùng vào subquery/count ở
   database, hoặc tạo custom repository query có cả content query và count query.
   Không lọc bằng `Page.map` sau khi pagination.
4. Tuyệt đối không trả phần tử `null`; giữ `Page.totalElements` và
   `totalPages` theo tập kết quả đã lọc.
5. Test filter `EXPIRED` với 3 bản ghi và size nhỏ hơn tổng kết quả xác nhận
   `content.size`, `totalElements = 3`, `totalPages` và HTTP response của FE.

### 4. Contest dùng discount hiển thị sai

**File/vị trí:**

- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:114`
- `BE/src/main/java/com/examprep/repositories/ContestRewardRepository.java:16-17`

Service truyền `discountId` vào `findByContestContestIdOrderByRankPositionAsc`,
trong khi repository method tìm theo `contestId`. Vì vậy discount id bị hiểu
như contest id.

**Đã sửa:**

1. Thêm `findByDiscount_DiscountIdOrderByRankPositionAsc` và dùng trực tiếp
   trong detail service.
2. EntityGraph tải contest/discount đúng quan hệ; test detail xác nhận title
   contest sử dụng discount.

### 5. Tham số phân trang không hợp lệ trả 500

**File/vị trí:**

- `BE/src/main/java/com/examprep/controllers/AdminDiscountController.java:20-36`
- `BE/src/main/java/com/examprep/controllers/AdminDiscountController.java:67-78`
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:48,285`

`PageRequest.of` ném exception với `page < 0` hoặc `size <= 0`; controller chưa
validate request parameter.

**Đã sửa:**

1. Bật method validation bằng `@Validated`.
2. Gắn `@Min(0)` cho `page`, `@Min(1)` và `@Max(100)`
   cho `size`, áp dụng cho cả list và assignments.
3. Bổ sung handler `ConstraintViolationException` để trả 400 thay vì 500.
4. Test `page=-1` và `size=0` đã được thêm.

### 6. `appliesTo` nhận chuỗi bất kỳ

**File/vị trí:**

- `BE/src/main/java/com/examprep/dto/AdminDiscountDtos.java:75-81`
  chỉ dùng `@NotBlank`.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:167,218`
  lưu trực tiếp giá trị uppercase.
- `FE/src/features/admin/pages/DiscountsPage.tsx:774-779` dùng state `string`
  thay vì type giới hạn.
- `BE/src/main/resources/db/migration/V45__discount_enhancements.sql:6`
  tạo column nhưng chưa có CHECK constraint.

**Đã sửa:**

1. Validate backend bằng allow-list chính thức: `COURSE`, `SUBSCRIPTION`, `ALL`;
   trả `VALIDATION_FAILED` cho giá trị khác.
2. Thêm database CHECK constraint trong migration mới để chặn dữ liệu ghi ngoài
   API.
3. Đổi form state và payload FE sang `AppliesTo`, không cast chuỗi tùy ý.
4. Test API với giá trị không hợp lệ đã được thêm; migration mới chặn dữ liệu
   sai ở database.

### 7. `findAll()` rồi lọc trong Java

**File/vị trí:**

- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:111-112`
  đọc toàn bộ `user_discounts` hai lần để tính thống kê detail.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:190,198`
  đọc toàn bộ assignments khi update.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:239`
  đọc toàn bộ `contest_rewards` khi đổi status.
- `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:260,269`
  đọc toàn bộ rewards/assignments khi delete.

**Đã sửa:**

1. Bổ sung repository query chuyên biệt: `countByDiscountId`,
   `countByDiscountIdAndIsUsedFalse`, `existsByDiscountId`, và query rewards
   theo discount với điều kiện contest.
2. Thay `findAll().stream()` bằng `COUNT`, `EXISTS` hoặc query có filter ở DB.
3. Dùng một query thống kê cho detail thay vì chạy hai lần trên cùng bảng.
4. Bổ sung index cho foreign key/filter thường dùng (`user_discounts.discount_id`,
   `contest_rewards.discount_id`, và các cột trạng thái nếu cần).
5. Thêm index cho `user_discounts(discount_id, is_used)` và
   `contest_rewards(discount_id)`.

### 8. Search gửi request cho mỗi ký tự

**File/vị trí hiện tại:**

- `FE/src/features/admin/pages/DiscountsPage.tsx:180-186` debounce keyword
  300 ms trước khi gọi load.
- `FE/src/features/admin/pages/DiscountsPage.tsx:199-225` chỉ load theo
  `debouncedKeyword`.
- Assignment search cũng debounce ở `:187-195`.

**Kết luận:** Checkout hiện tại đã có debounce 300 ms cho cả discount search và
assignment search. Không thêm debounce thứ hai.

### 9. Đóng detail modal rồi modal tự mở lại

**File/vị trí hiện tại:**

- `FE/src/features/admin/pages/DiscountsPage.tsx:278-296` gắn request id cho
  request mở detail và chỉ set detail khi request còn hợp lệ.
- `FE/src/features/admin/pages/DiscountsPage.tsx:298-305` tăng request id khi
  đóng modal và hủy trạng thái loading.
- `FE/src/features/admin/pages/DiscountsPage.tsx:842-848` modal chỉ mở khi
  `detailLoading || !!detail`.

**Kết luận:** Request-id guard hiện đã ngăn response cũ mở lại modal sau khi
đóng; không cần thay đổi thêm.

## Thứ tự triển khai đề xuất

Tất cả hạng mục cần sửa đã được triển khai. #8 và #9 đã đúng trong checkout
trước khi thực hiện batch này nên không thay đổi thêm.

## Validation sau khi sửa

- BE: `AdminDiscountAndFlashcardComprehensiveTest` pass 11/11, bao gồm các
  regression test cho query, pagination, validity, contest lookup và appliesTo.
- FE: TypeScript check pass; `FIXED_AMOUNT` là type duy nhất ở Admin/Contest.
- FE: debounce và request-id guard đã được kiểm tra trong code hiện tại.
- API thủ công: assignments không keyword, list với `page=-1`/`size=0`, filter
  `FIXED_AMOUNT`, filter `EXPIRED`, create với `appliesTo` không hợp lệ.
