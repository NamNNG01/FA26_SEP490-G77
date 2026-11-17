# Phân tích vấn đề Discussion và Contribution

## Phạm vi

Báo cáo này đối chiếu test report [2026-11-17-discussion-contributions.md](C:/Users/ADMIN/Downloads/2026-11-17-discussion-contributions.md) với code hiện tại.

- Chỉ phân tích vấn đề và đề xuất cách sửa.
- Chưa thay đổi code.
- Các file chính liên quan:
  - [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx)
  - [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)
  - [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java)
  - [ManagerDiscussionPage.tsx](FE/src/features/content-manager/pages/ManagerDiscussionPage.tsx)
  - [ManagerDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/ManagerDiscussionServiceImpl.java)
  - [StudentContributionsPage.tsx](FE/src/features/student/pages/StudentContributionsPage.tsx)

## 1. Các vấn đề còn tồn tại cần sửa

### D1 - Có thể upvote/bookmark bài chưa được duyệt

- **Mức độ:** Cao
- **Layer:** Backend, frontend chỉ che giao diện
- **Hiện trạng:**
  - Frontend đã ẩn action với bài pending/rejected.
  - Backend `createComment` đã chặn comment chưa approved.
  - Nhưng backend `toggleUpvote` và `toggleBookmark` không kiểm tra `approvalStatus` hoặc `status`.
- **Nguyên nhân:** API action chỉ tìm discussion rồi thực hiện thay đổi, không kiểm tra visibility/moderation state.
- **Cần sửa:**
  - Tạo helper kiểm tra discussion có được phép tương tác.
  - Chỉ cho phép khi `approvalStatus = APPROVED`.
  - Từ chối nếu `status = HIDDEN`.
  - Áp dụng cho upvote và bookmark, không chỉ dựa vào frontend.
- **Test cần thêm:**
  - Pending/rejected/hidden không thể upvote.
  - Pending/rejected/hidden không thể bookmark.
  - Approved vẫn upvote/bookmark bình thường.

### D2 - Author có thể mở lại bài do manager đóng

- **Mức độ:** Cao
- **Layer:** Backend
- **File:** [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)
- **Hiện trạng:** `updateDiscussion` chỉ kiểm tra người gọi có phải author hay không. Author vẫn có thể gọi API với `isClosed = false` sau khi manager đã đóng bài.
- **Nguyên nhân:** Entity chỉ có `isClosed/status`, không lưu ai là người đóng bài.
- **Cần sửa:**
  - Thêm metadata như `closedByManager` hoặc `closedByUserId`.
  - Khi manager đóng bài, lưu nguồn thao tác là manager.
  - Author không được reopen bài đã bị manager đóng.
  - Manager vẫn được reopen bài trong phạm vi course.
- **Không nên:** Chỉ kiểm tra `isClosed`, vì field này không cho biết ai đã đóng.

### D3 - `commentCount` tính cả reply hidden

- **Mức độ:** Trung bình
- **Layer:** Backend và frontend
- **Hiện trạng:**
  - Detail student/manager đã lọc reply hidden khi hiển thị.
  - Tuy nhiên `Discussion.commentCount` vẫn tăng khi tạo reply và không giảm khi hide.
  - List card lấy trực tiếp `item.commentCount`, nên số hiển thị có thể lớn hơn số reply student nhìn thấy.
- **Cần sửa, chọn một phương án:**
  1. Tính count bằng query chỉ đếm reply `VISIBLE`; hoặc
  2. Cập nhật counter khi hide/restore/delete reply.
- **Khuyến nghị:** Dùng query count reply visible cho public/student; manager có thể hiển thị tổng reply để moderation.
- **Test cần thêm:** 3 reply, hide 1 reply thì student thấy 2; restore lại thì thấy 3.

### D9 - Trạng thái anonymous của reply bị giữ lại

- **Mức độ:** Thấp
- **Layer:** Frontend
- **File:** [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx)
- **Hiện trạng:** Sau khi post reply, code reset nội dung và ảnh nhưng không reset `anonymous`.
- **Cần sửa:** Sau khi post thành công, gọi reset `anonymous` về `false`.
- **Lưu ý:** Nếu product chủ ý nhớ lựa chọn anonymous giữa các reply thì cần ghi rõ behavior này trong đặc tả, không xem là bug.

### D11 - Search `%` và `_` bị hiểu là wildcard

- **Mức độ:** Thấp nhưng ảnh hưởng tính đúng kết quả
- **Layer:** Backend
- **File:** [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java)
- **Hiện trạng:** Query dùng `LIKE '%search%'` mà không escape ký tự `%` và `_`.
- **Nguyên nhân:** Input người dùng được đưa vào LIKE pattern trực tiếp.
- **Cần sửa:**
  - Escape `%`, `_` và ký tự escape trước khi truyền query.
  - Thêm `ESCAPE` vào JPQL/native query theo cách tương thích database.
  - Hoặc dùng Specification/Criteria với helper escape LIKE.
- **Test cần thêm:** `%`, `_`, `\`, chuỗi thông thường và chuỗi không có kết quả.

### D14 - Backend vẫn cho Pin/Close bài pending hoặc rejected

- **Mức độ:** Trung bình
- **Layer:** Backend
- **Hiện trạng:**
  - Frontend đã chỉ hiển thị Pin/Close với bài `APPROVED`.
  - Backend `updatePin` và `updateClose` chỉ kiểm tra manager có quyền trên course, chưa kiểm tra approval status.
- **Cần sửa:**
  - Backend chỉ cho Pin/Close khi `approvalStatus = APPROVED`.
  - Nếu bài rejected/pending, trả lỗi 409 hoặc 400 theo convention hiện tại.
  - Không phụ thuộc vào việc frontend có ẩn button hay không.

### D16 - Thứ tự reply giữa student và manager không thống nhất

- **Mức độ:** Thấp
- **Layer:** Backend/frontend
- **Hiện trạng code:**
  - Student repository lấy reply theo `createdAt DESC` và frontend render trực tiếp.
  - Manager cũng lấy `DESC` nhưng frontend lại `.reverse()`.
  - Vì vậy thứ tự hiện tại giữa hai role khác nhau.
- **Cần sửa:** Chọn một chuẩn duy nhất, khuyến nghị mới nhất trước cho cả hai màn hình.
  - Hoặc bỏ `.reverse()` ở manager.
  - Hoặc đổi query/service để hai bên cùng trả cùng thứ tự.
- **Test cần thêm:** Một discussion có 3 reply và kiểm tra thứ tự ở cả student/manager.

### D18 - Message tiếng Việt trong giao diện/API tiếng Anh

- **Mức độ:** Thấp
- **Layer:** Backend/i18n
- **Hiện trạng:**
  - Anonymous display name là `Học sinh ẩn danh`.
  - Contribution review trả message `Đã duyệt câu hỏi.` và `Đã từ chối câu hỏi.`.
- **Cần sửa:**
  - Dùng message key/localization.
  - Nếu UI hiện tại là tiếng Anh, dùng `Anonymous student`, `Question approved.`, `Question rejected.`.
  - Không hard-code message theo một ngôn ngữ trong service/controller.

### L1 - `reviewedAt` không được clear khi resubmit

- **Mức độ:** Thấp
- **Layer:** Backend
- **File:** [StudentContributionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentContributionServiceImpl.java)
- **Hiện trạng:** Resubmit đổi status về `PENDING` và xóa `reviewNote`, nhưng giữ `reviewedAt`.
- **Hậu quả:** API/database vẫn chứa thời điểm review cũ cho một submission đang pending.
- **Cần sửa:**
  - Khi resubmit, `reviewedAt = null`.
  - `reviewedBy = null` nếu entity có field này.
  - Xóa review note cũ.
  - Xác định rõ `submittedAt` là thời điểm submit đầu tiên hay lần submit gần nhất; nếu là lần gần nhất thì cập nhật field hoặc thêm `lastSubmittedAt`.
- **Test cần thêm:** rejected → resubmit → status pending, `reviewedAt = null`, feedback cũ không còn.

## 2. Vấn đề My Discussions chưa hoàn chỉnh

### Thiếu filter course

- API hiện có `scope=MINE`, nhưng chưa nhận `courseId`.
- Frontend My Discussions cũng chưa có course selector.
- Nếu giữ yêu cầu trong plan, cần sửa toàn bộ chuỗi:
  - Controller nhận `courseId`.
  - Service truyền `courseId`.
  - Repository thêm predicate `d.course.courseId = :courseId`.
  - Frontend thêm course filter và reset page về 0 khi đổi filter.

### Thiếu filter tag trên UI

- Backend có thể nhận `tag`.
- Frontend My Discussions đang truyền `tag = ALL` cố định.
- Cần thêm filter Question/Tip/Announcement nếu đây là requirement chính thức.

### DTO không trả `status`

- FE type có khai báo `status`, nhưng `DiscussionItemDto` và `DiscussionDetailDto` backend chưa trả field này.
- Hậu quả:
  - Hidden badge không hiển thị đúng.
  - FE có thể coi bài hidden là approved vì `status` runtime là `undefined`.
  - Detail có thể hiện action không phù hợp.
- Cần thêm `status` vào DTO, map từ entity và cập nhật test response.

### Course bị ẩn khỏi response

- `DiscussionItemDto.course` có `@JsonIgnore`.
- Nếu My Discussions cần hiển thị bài thuộc course nào, cần expose rõ:
  - `courseId`
  - `courseTitle`
- Không nên để frontend phụ thuộc vào object đang bị ignore.

### Mâu thuẫn “course optional”

- Frontend cho phép chọn “No course (general post)”.
- Backend lại yêu cầu `courseId` và trả lỗi nếu thiếu.
- Cần chọn một contract:
  - Nếu course bắt buộc: sửa label/UI thành bắt buộc và bỏ lựa chọn general post.
  - Nếu general post hợp lệ: sửa entity, repository, authorization và public filter để hỗ trợ `course_id = null`.

## 3. Các lỗi đã được xử lý, không cần sửa lại

Các vấn đề sau đã có xử lý trong code hiện tại:

- D4: reply draft được reset khi đổi discussion.
- D5: đã có tab My Discussions và scope MINE.
- D6: invalid/not-found detail không còn Retry vô nghĩa.
- D7: file ảnh được kiểm tra magic bytes.
- D8: student search có debounce.
- D10: Cancel draft có confirm discard.
- D12: legacy tag `GENERAL` được map label.
- D13: có Cancel rejection mode.
- D15: dùng wording `Reply deleted`.
- D17: anonymous reply dùng avatar anonymous ở manager.
- C1: submit/resubmit có success toast.
- C2: có `Correct answers` cho multiple answers.
- C4: placeholder fill blank được đổi thành `____`.
- L2: badge/filter dùng nhãn Accepted thống nhất.
- L3: empty state phân biệt chưa có dữ liệu và không khớp filter.
- L4: React key của question/deck đã phân biệt.
- L5: Pagination đã hỗ trợ singular/plural.

## 4. Thứ tự ưu tiên triển khai

### P0 - Bắt buộc sửa trước

1. Chặn upvote/bookmark với bài chưa approved/hidden.
2. Ngăn author reopen bài do manager đóng.
3. Thêm `status` vào DTO và sửa action visibility.
4. Sửa comment count hidden.

### P1 - Sửa contract và tính đúng dữ liệu

1. Escape LIKE search.
2. Chặn Pin/Close ở backend với bài chưa approved.
3. Hoàn thiện course/tag filter cho My Discussions.
4. Đồng bộ behavior course optional/bắt buộc.
5. Clear review metadata khi resubmit.

### P2 - UX và consistency

1. Reset anonymous sau reply.
2. Đồng nhất thứ tự reply.
3. Chuẩn hóa anonymous avatar ở mọi màn hình manager.
4. Chuẩn hóa localization/message tiếng Anh.

## 5. Kiểm tra đã thực hiện

- TypeScript frontend: pass.
- Focused backend test `StudentDiscussionServiceTest`: pass.
- Chưa chạy lại browser/DB flow trong lần lập báo cáo này.
- Kết luận về D1, D2, D3, D11, D14 và L1 dựa trên code path hiện tại; cần bổ sung integration test để khóa behavior sau khi sửa.

