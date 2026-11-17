# Báo cáo đối chiếu lỗi Discussion/Contribution với code

- Ngày kiểm tra: 2026-11-17
- Phạm vi: đối chiếu [2026-11-17-discussion-contributions.md](C:/Users/ADMIN/Downloads/2026-11-17-discussion-contributions.md) và [discussion-my-tab-plan.md](discussion-my-tab-plan.md) với code hiện tại.
- Kết luận: chưa sửa code trong lần kiểm tra này.

## 1. Tóm tắt

Code hiện tại đã có một phần lớn các thay đổi trong kế hoạch **My Discussions**: tab đã tồn tại, API hỗ trợ `scope=PUBLIC/MINE`, có lọc approval/status, debounce search, empty state và reset draft khi đổi detail.

Tuy nhiên vẫn còn các vấn đề cần sửa:

1. Backend chưa chặn upvote/bookmark đối với bài chưa được duyệt/đã hidden.
2. Author vẫn có thể mở lại bài do manager đóng; model không lưu nguồn của thao tác close.
3. `commentCount` trong database/list vẫn tính cả reply hidden, dù detail đã lọc khi hiển thị.
4. `DiscussionItemDto`/`DiscussionDetailDto` không trả `status`, làm filter/card/detail của bài `HIDDEN` không đáng tin.
5. My Discussions chưa có `courseId` và tag filter như plan; DTO course lại bị `@JsonIgnore`.
6. Một số dữ liệu moderation còn stale hoặc còn chuỗi tiếng Việt trong API.
7. Search chưa escape ký tự wildcard SQL LIKE.

## 2. Đối chiếu từng lỗi trong test report

### Course Discussion - Student

| ID | Kết quả kiểm tra code | Bằng chứng / nhận xét |
|---|---|---|
| D1 | **Còn một phần** | FE đã ẩn reply/upvote/save với post chưa approved trong [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx). `createComment` cũng chặn ở [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java). Nhưng `toggleUpvote` và `toggleBookmark` không kiểm tra `approvalStatus`/`status`, nên API vẫn cho upvote bài rejected/hidden. |
| D2 | **Còn** | `updateDiscussion` chỉ kiểm tra `d.user == userId`, không phân biệt close bởi author hay manager. Manager close sau đó author vẫn gọi API reopen được trong [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java). |
| D3 | **Còn một phần** | Detail FE đếm reply visible, và manager detail cũng lọc count. Nhưng `Discussion.commentCount` vẫn tăng khi tạo reply và không giảm khi hide; list card dùng trực tiếp `item.commentCount`. Vì vậy list có thể vẫn hiển thị nhiều hơn số reply student nhìn thấy. |
| D4 | **Đã xử lý** | `DiscussionDetail` reset `comment` và `commentImageUrl` trong effect theo `discussionId` tại [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx). |
| D5 | **Đã xử lý một phần** | Tab My Discussions đã có và dùng `scope=MINE`, nên post pending/rejected của owner có thể xuất hiện. Tuy nhiên tab hiện chưa có course/tag filter như plan. |
| D6 | **Đã xử lý** | Detail kiểm tra id không hợp lệ/not found và hiển thị trạng thái not found không có Retry. |
| D7 | **Đã xử lý** | [DiscussionImageAttachment.tsx](FE/src/components/common/DiscussionImageAttachment.tsx) kiểm tra magic bytes PNG/JPEG/GIF/WEBP, không chỉ dựa vào extension/MIME. |
| D8 | **Đã xử lý** | Search student có debounce 300 ms trong [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx). |
| D9 | **Còn** | Sau khi post reply, code chỉ reset nội dung và ảnh; không reset `anonymous`, nên reply tiếp theo vẫn anonymous. |
| D10 | **Đã thay đổi theo hướng an toàn hơn** | Cancel hiện hỏi xác nhận nếu có draft; chọn Cancel trong confirm giữ draft, chọn Discard mới xóa. Đây không còn là lỗi rõ ràng. |

### Course Discussion - Manager

| ID | Kết quả kiểm tra code | Bằng chứng / nhận xét |
|---|---|---|
| D11 | **Còn** | Repository dùng `LIKE CONCAT('%', :search, '%')` trong [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java), không escape `%`/`_`. Search `%` vẫn là wildcard. |
| D12 | **Đã xử lý** | `tagLabel` đã map cả `GENERAL/general` trong [ManagerDiscussionPage.tsx](FE/src/features/content-manager/pages/ManagerDiscussionPage.tsx). |
| D13 | **Đã xử lý** | Có `Cancel rejection` trong reject mode. |
| D14 | **FE đã xử lý, BE còn hở** | FE chỉ hiển thị Pin/Close cho `APPROVED`. Nhưng `updatePin` và `updateClose` backend chỉ kiểm tra manager scope, chưa chặn pending/rejected. Client khác vẫn gọi được API. |
| D15 | **Đã xử lý** | Toast xóa reply là `Reply deleted.`. |
| D16 | **Còn** | Hai role vẫn khác thứ tự: repository student trả DESC và FE render trực tiếp; manager repository trả DESC nhưng FE lại `.reverse()`. Kết quả code hiện tại là Student mới nhất trước, Manager cũ nhất trước, ngược với mô tả trong test report. |
| D17 | **Đã xử lý cho reply** | `ManagerReply` dùng anonymous image khi `isAnonymous` hoặc tên anonymous. Cần lưu ý avatar của anonymous discussion author trong manager detail chưa dùng helper tương tự. |
| D18 | **Còn** | Backend vẫn trả `Học sinh ẩn danh` trong `DiscussionItemDto.AuthorDto`, và manager contribution API vẫn trả `Đã duyệt câu hỏi.`/`Đã từ chối câu hỏi.` trong [ContributionReviewController.java](BE/src/main/java/com/examprep/controllers/manager/ContributionReviewController.java). |

### Question Contribution

| ID | Kết quả kiểm tra code | Bằng chứng / nhận xét |
|---|---|---|
| C1 | **Đã xử lý** | Modal gọi `toast.success` sau submit/resubmit trong [StudentContributionsPage.tsx](FE/src/features/student/pages/StudentContributionsPage.tsx). |
| C2 | **Đã xử lý** | [QuestionForm.tsx](FE/src/features/question/components/QuestionForm.tsx) dùng `Correct answers` khi có nhiều đáp án đúng. |
| C3 | **Đã xử lý một phần** | Ordering đã đổi label thành `Correct Order` ở read-only; hint matching chỉ render khi không read-only. Cần regression test thêm cho toàn bộ type để đảm bảo không còn editor hint ở preview. |
| C4 | **Đã xử lý** | Summary thay `{{n}}` bằng `____` khi dựng row contribution. |

### My Contributed Questions

| ID | Kết quả kiểm tra code | Bằng chứng / nhận xét |
|---|---|---|
| L1 | **Backend còn, FE đang che bớt** | Resubmit chỉ `setStatus("PENDING")` và `setReviewNote(null)`, không clear `reviewedAt` trong [StudentContributionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentContributionServiceImpl.java). FE chỉ hiển thị `Reviewed` cho trạng thái đã review nên stale value chưa luôn lộ ra, nhưng API/database vẫn sai ngữ nghĩa. |
| L2 | **Đã xử lý** | Filter và `StatusBadge` đều dùng nhãn `Accepted` cho `ACCEPTED/APPROVED`. |
| L3 | **Đã xử lý** | Empty state phân biệt `items.length` và filtered result; có `No contributions match these filters`. |
| L4 | **Đã xử lý** | Row dùng key phân biệt `question-${contributionId}` và `deck-${deckId}`. |
| L5 | **Đã xử lý phần chính** | Pagination tự singularize `submissions`; count contribution cũng có singular/plural. Không còn thấy các label `posts/upvotes` trong màn này. |

## 3. Đối chiếu kế hoạch My Discussions

### Đã có

- `GET /student/discussions` có `scope`, approval/status filter, search, sort, page/size.
- `scope=MINE` filter ownership bằng `d.user.userId = :userId`, không nhận `userId` từ client.
- Public query vẫn cố định `APPROVED` và non-`HIDDEN`.
- Có validation enum, paging và giới hạn search 100 ký tự.
- FE có tab, badge, filter approval/status, debounce search, pagination và empty state.
- Có unit test cho public list, mine list và yêu cầu authentication trong [StudentDiscussionServiceTest.java](BE/src/test/java/com/examprep/services/student/StudentDiscussionServiceTest.java).

### Chưa khớp plan hoặc có rủi ro

1. **Thiếu `courseId`**
   - Controller/service/repository của `scope=MINE` không nhận `courseId`.
   - FE cũng không hiển thị course filter trong My Discussions.
   - Cần thêm filter course nếu vẫn giữ yêu cầu trong plan.

2. **Thiếu tag filter trên UI My Discussions**
   - Backend nhận `tag`, nhưng FE chỉ gửi `tag: 'ALL'` cố định.
   - UI không có Question/Tip/Announcement selector.

3. **Không trả content status**
   - `DiscussionItemDto` và `DiscussionDetailDto` không có field `status`; service map cũng không set.
   - FE type có khai báo `status`, nhưng runtime JSON không có field này.
   - Hậu quả: badge Hidden không hiện, `item.status !== 'HIDDEN'` đánh giá sai, và detail hidden có thể vẫn hiện action.

4. **Course trong DTO bị ẩn**
   - `DiscussionItemDto.course` có `@JsonIgnore`.
   - Nếu My Discussions cần hiển thị course, cần expose `courseId/courseTitle` rõ ràng hoặc DTO riêng; không nên để FE phụ thuộc field bị ignore.

5. **Mâu thuẫn “general post”**
   - FE hiển thị `Course (optional)` và “No course (general post)” trong [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx).
   - Backend `createDiscussion` lại ném `Course is required` khi `courseId == null`.
   - Cần chọn một contract: bắt buộc course và sửa UI, hoặc cho phép general post và sửa entity/query/authorization tương ứng.

6. **Rejection reason**
   - Plan đề xuất chỉ ở detail là hợp lý; code hiện tại detail đã trả `rejectionReason`, list không trả.

## 4. Đề xuất sửa theo thứ tự ưu tiên

### P0 - quyền và tính đúng dữ liệu

1. Tạo helper backend kiểu `assertDiscussionCanReact(discussion)`:
   - chỉ cho upvote/bookmark khi `approvalStatus == APPROVED`;
   - từ chối `status == HIDDEN`;
   - dùng chung cho toggle upvote và bookmark;
   - thêm test API cho pending/rejected/hidden.

2. Bổ sung nguồn close:
   - thêm trạng thái/metadata xác định `closedByManager` (hoặc audit field tương đương);
   - manager close đặt cờ;
   - author chỉ được reopen nếu không phải manager-closed;
   - không suy luận bằng `isClosed` vì mất nguồn thao tác.

3. Sửa status DTO:
   - thêm `status` vào `DiscussionItemDto` và `DiscussionDetailDto`;
   - map giá trị entity `OPEN/CLOSED/HIDDEN`;
   - cập nhật type FE;
   - thêm test hidden detail/list để chắc chắn action bị ẩn.

4. Quyết định cách tính reply count:
   - tốt nhất query/count visible replies cho public/student list;
   - hoặc cập nhật counter khi hide/restore;
   - manager vẫn có thể dùng tổng riêng nếu cần moderation.

### P1 - hoàn thiện contract My Discussions

1. Thêm `courseId` từ controller → service → `findMineDiscussions` và thêm predicate course.
2. Thêm tag filter vào UI và truyền giá trị thật thay vì luôn `ALL`.
3. Expose `courseId/courseTitle` bằng field rõ ràng trong DTO nếu UI cần hiển thị course.
4. Đồng bộ `Course (optional)` với backend.
5. Escape `%`, `_` và escape character trong LIKE; hoặc dùng cơ chế query/predicate có escaping. Nên test `%`, `_`, `\` và chuỗi bình thường.

### P2 - UX/i18n và consistency

1. Reset `anonymous` sau khi post reply nếu product không chủ ý lưu lựa chọn.
2. Chọn một thứ tự reply và dùng chung cho student/manager.
3. Dùng anonymous avatar helper cho cả discussion author trong manager detail.
4. Đưa message moderation sang message key tiếng Anh/localization thay vì hard-code tiếng Việt.
5. Clear `reviewedAt` khi resubmit; cân nhắc cập nhật `submittedAt`/`updatedAt` theo định nghĩa “Submitted”.

## 5. Kiểm tra đã chạy

- Frontend: `FE\node_modules\.bin\tsc.cmd --noEmit` — **pass**.
- Backend: `BE\mvn -q -Dtest=StudentDiscussionServiceTest test` — **pass**.
- Đây là kiểm tra compile/unit tập trung; chưa chạy browser lại và chưa chạy full integration suite. Các lỗi D1/D2/D3/D11/D14/L1 là kết luận từ code path, không phải kết quả chạy lại DB/browser trong lần này.

