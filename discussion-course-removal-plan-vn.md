# Plan sửa Discussion: bỏ liên kết Course và giới hạn quyền đóng/mở

## 1. Quyết định nghiệp vụ mới

1. Discussion không còn thuộc cố định về một `Course`.
2. Không còn dùng `courseId` trong request, response, filter, route hoặc authorization của Discussion.
3. Student chỉ được tạo discussion khi user có ít nhất một enrollment đang `ACTIVE`.
4. Manager/Admin được tạo và moderation discussion global; không cần chọn course.
5. Chỉ student là author của bài được đóng/mở lại bài của mình.
6. Manager không còn endpoint, button hoặc service method đóng/mở discussion.
7. Các chức năng còn lại trong báo cáo vẫn sửa:
   - Chặn reaction với bài chưa approved/hidden.
   - Chặn Pin với bài chưa approved.
   - Sửa hidden reply count.
   - Trả `status` trong DTO.
   - Escape wildcard search.
   - Clear review metadata khi resubmit.
   - Đồng nhất thứ tự reply và localization.

## 2. Thiết kế dữ liệu và migration Backend

### 2.1. Entity `Discussion`

File: [Discussion.java](BE/src/main/java/com/examprep/entities/Discussion.java)

- Bỏ field:

```java
private Course course;
```

- Bỏ `@ManyToOne`, `@JoinColumn(name = "course_id")`.
- Không thêm `closedByManager`; vì manager không còn quyền close/reopen.
- Giữ các field:
  - `user`
  - `status`
  - `isClosed`
  - `approvalStatus`
  - `isPinned`
  - `tag`
  - `commentCount`
  - moderation metadata khác.

### 2.2. Database migration

Tạo Flyway migration mới, không sửa migration đã chạy ở môi trường khác:

1. Xử lý foreign key/index liên quan `discussions.course_id`.
2. Xóa column `course_id` khỏi `discussions`.
3. Cập nhật schema nullable/constraint nếu còn constraint bắt buộc.
4. Kiểm tra dữ liệu discussion cũ trước khi drop column.
5. Không xóa bảng enrollment hoặc dữ liệu course; course vẫn dùng cho các chức năng khác.

Migration phải được kiểm tra trên:

- Database mới.
- Database đã có discussion cũ.
- Database có discussion được tạo bởi manager và student.

## 3. Backend - Student Discussion

### 3.1. Create discussion

Files:

- [StudentDiscussionController.java](BE/src/main/java/com/examprep/controllers/StudentDiscussionController.java)
- [StudentDiscussionService.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionService.java)
- [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)
- [CreateDiscussionRequestDto.java](BE/src/main/java/com/examprep/dto/student/CreateDiscussionRequestDto.java)

Thay đổi:

1. Bỏ `courseId` khỏi request DTO.
2. Xóa kiểm tra `courseRepository.findById(courseId)`.
3. Xóa nhánh “manager của course”.
4. Với student:
   - lấy user hiện tại;
   - kiểm tra user có ít nhất một enrollment `ACTIVE`;
   - không cần client gửi course nào;
   - không tin course id từ body.
5. Nếu không có active enrollment, trả lỗi 403 theo security convention.
6. Tạo discussion với `course = null`.
7. Giữ approval behavior:
   - student tạo: `PENDING`;
   - manager/admin tạo: `APPROVED`.
8. Nếu student không được tạo announcement thì giữ rule hiện tại; rule này không cần course để kiểm tra quyền.

Repository enrollment cần có method dạng:

```java
boolean existsByUser_UserIdAndStatus(Long userId, String status);
```

Tên method phải theo đúng naming convention hiện tại của `EnrollmentRepository`.

### 3.2. List student discussions

Files:

- [StudentDiscussionController.java](BE/src/main/java/com/examprep/controllers/StudentDiscussionController.java)
- [StudentDiscussionService.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionService.java)
- [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)
- [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java)

Thay đổi:

1. Bỏ `courseId` khỏi toàn bộ list API.
2. Public feed chỉ filter theo:
   - approval status;
   - hidden status;
   - tag;
   - search;
   - sort;
   - pagination.
3. `scope=MINE` chỉ filter theo `d.user.userId = currentUserId`.
4. `findMineDiscussions` bỏ `courseId`.
5. `findAllDiscussions` bỏ `LEFT JOIN FETCH d.course`.
6. `listTips` bỏ `courseId`; endpoint `/student/tips` không nhận course filter nữa.
7. Nếu giữ tab Tips, tab này hiển thị toàn bộ approved tips global.

### 3.3. DTO

Files:

- [DiscussionItemDto.java](BE/src/main/java/com/examprep/dto/student/DiscussionItemDto.java)
- [DiscussionDetailDto.java](BE/src/main/java/com/examprep/dto/student/DiscussionDetailDto.java)

Thay đổi:

1. Bỏ `CourseRefDto course` khỏi `DiscussionItemDto`.
2. Thêm field `status` vào cả item và detail DTO nếu chưa có.
3. Service map đầy đủ `OPEN`, `CLOSED`, `HIDDEN`.
4. Không trả `courseId/courseTitle` trong discussion response.
5. Không thêm field thay thế liên quan course.

## 4. Backend - Manager Discussion

### 4.1. Route/API mới

Files:

- [ManagerDiscussionController.java](BE/src/main/java/com/examprep/controllers/ManagerDiscussionController.java)
- [ManagerDiscussionService.java](BE/src/main/java/com/examprep/services/ManagerDiscussionService.java)
- [ManagerDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/ManagerDiscussionServiceImpl.java)
- [managerDiscussion.service.ts](FE/src/services/managerDiscussion.service.ts)

Đổi API từ course-scoped sang global:

| Hiện tại | Đề xuất |
|---|---|
| `POST /manager/courses/{courseId}/discussions` | `POST /manager/discussions` |
| `GET /manager/courses/{courseId}/discussions` | `GET /manager/discussions` |
| `GET /manager/discussions/{discussionId}` | Giữ nguyên |
| `PATCH /manager/discussions/{discussionId}/pin` | Giữ nguyên |
| `PATCH /manager/discussions/{discussionId}/close` | Xóa |
| `DELETE /manager/discussions/{discussionId}` | Giữ nguyên |
| Comment moderation APIs | Giữ nguyên path, bỏ course authorization |

Authorization mới:

1. Dùng role ADMIN/MANAGER theo security convention.
2. Không gọi `validateCourseManager`.
3. Không dùng `CourseRepository` hoặc `CourseManagerRepository` trong discussion service.
4. Detail/delete/pin/approve/reject/comment moderation kiểm tra manager/admin global.

### 4.2. Manager create/list

Trong [ManagerDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/ManagerDiscussionServiceImpl.java):

1. `createDiscussion` bỏ `courseId`.
2. Entity tạo với `course = null`.
3. `listDiscussions` bỏ `courseId` và trả global list.
4. Repository manager query bỏ course predicate và course join.
5. Bỏ `CourseRefDto` khỏi mapping.
6. Giữ filter approval/status/search/pagination.
7. Manager vẫn được Pin/Unpin bài `APPROVED`.
8. Backend phải từ chối Pin bài pending/rejected/hidden.
9. Xóa `updateClose` khỏi interface, implementation và controller.

### 4.3. Student close/open

Files:

- [StudentDiscussionController.java](BE/src/main/java/com/examprep/controllers/StudentDiscussionController.java)
- [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)

Giữ endpoint student hiện tại:

```http
PATCH /student/discussions/{discussionId}
```

Rule:

1. Chỉ authenticated student là author được gọi.
2. Không cho manager gọi endpoint này để đóng/mở.
3. Có thể đóng/mở bài đã `APPROVED` của chính mình.
4. Không cho đóng/mở bài `PENDING`, `REJECTED` hoặc `HIDDEN`, trừ khi product xác nhận cần behavior khác.
5. Khi close:
   - `isClosed = true`;
   - `status = CLOSED`.
6. Khi reopen:
   - `isClosed = false`;
   - `status = OPEN`.

Vì manager bỏ quyền close nên không cần lưu “closed by manager”.

## 5. Backend - các sửa còn lại theo báo cáo

### 5.1. Reaction authorization

File: [StudentDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentDiscussionServiceImpl.java)

Tạo helper dùng chung cho upvote/bookmark:

- `approvalStatus = APPROVED`;
- `status != HIDDEN`;
- discussion tồn tại.

Pending/rejected/hidden phải trả lỗi rõ ràng, không tạo dữ liệu reaction.

### 5.2. Hidden reply count

Files:

- [DiscussionCommentRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionCommentRepository.java)
- [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java)
- [ManagerDiscussionServiceImpl.java](BE/src/main/java/com/examprep/services/ManagerDiscussionServiceImpl.java)

Khuyến nghị:

1. Public/student list dùng count reply `VISIBLE`.
2. Manager detail có thể hiển thị visible count và hidden count riêng.
3. Khi hide/restore/delete reply, không để counter public bị stale.
4. Không dùng một `commentCount` tổng cho cả public và moderation nếu hai màn hình có ý nghĩa khác nhau.

### 5.3. Search wildcard

File: [DiscussionRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionRepository.java)

- Escape `%`, `_` và escape character.
- Dùng `ESCAPE` trong query hoặc helper Specification.
- Áp dụng cho public, mine và manager search.

### 5.4. Reply order

Files:

- [DiscussionCommentRepository.java](BE/src/main/java/com/examprep/repositories/DiscussionCommentRepository.java)
- [ManagerDiscussionPage.tsx](FE/src/features/content-manager/pages/ManagerDiscussionPage.tsx)

Chọn một convention, khuyến nghị newest-first:

- Repository trả `createdAt DESC`.
- Student render trực tiếp.
- Manager bỏ `.reverse()`.

### 5.5. Contribution resubmit

File: [StudentContributionServiceImpl.java](BE/src/main/java/com/examprep/services/student/StudentContributionServiceImpl.java)

Khi resubmit:

- status → `PENDING`;
- `reviewedAt = null`;
- `reviewedBy = null` nếu có;
- `reviewNote = null`;
- xác định rõ `submittedAt` là first submission hay latest submission;
- thêm `lastSubmittedAt` nếu cần giữ cả hai thông tin.

## 6. Frontend - Student

Files:

- [StudentCommunityPage.tsx](FE/src/features/student/pages/StudentCommunityPage.tsx)
- [studentCommunity.service.ts](FE/src/services/studentCommunity.service.ts)

Thay đổi:

1. Xóa `courses`, `courseId`, `studentCourseService` khỏi community nếu không còn dùng cho Tips.
2. Xóa course selector của Tips vì Discussion/Tips đều global theo yêu cầu mới.
3. Xóa course selector trong Create Discussion Modal.
4. Đổi label không còn “Course (optional)” hoặc “No course (general post)”.
5. Không gửi `courseId` trong `createDiscussion`.
6. Nếu student không có active enrollment, disable hoặc ẩn nút Create post; backend vẫn phải kiểm tra lại.
7. Giữ tab:
   - Discussions;
   - My Discussions;
   - Tips;
   - Announcements.
8. My Discussions vẫn giữ filter approval/status/search/sort.
9. Nếu cần tag filter trong My Discussions, thêm selector tag.
10. Card/detail dùng field `status` từ backend để:
    - hiện Hidden/Closed;
    - ẩn reaction với hidden;
    - không hiện form reply khi chưa approved/hidden.
11. Chỉ giữ nút Close/Reopen ở student detail và chỉ khi `item.isAuthor`.
12. Reset `anonymous` sau khi post reply thành công.
13. Chuẩn hóa reply order theo backend.

## 7. Frontend - Manager

Files:

- [ManagerDiscussionPage.tsx](FE/src/features/content-manager/pages/ManagerDiscussionPage.tsx)
- [managerDiscussion.service.ts](FE/src/services/managerDiscussion.service.ts)

Thay đổi:

1. Bỏ state `courses`, `courseId`, `courseError`.
2. Bỏ gọi `courseService.getCourses`.
3. Bỏ course selector.
4. Gọi global manager list API.
5. Create modal không nhận `courseTitle`.
6. Đổi text:
   - `Course discussions` → `Discussions` hoặc `Community discussions`;
   - `Create course post` → `Create discussion`;
   - `Publishing to ...` → `Publishing globally`.
7. Bỏ `setClosed` khỏi service FE.
8. Bỏ `toggleClosed` khỏi page.
9. Bỏ button Close/Reopen trong modal footer.
10. Không cho manager close/reopen qua UI.
11. Giữ Pin/Unpin, nhưng chỉ render cho approved.
12. Sửa avatar anonymous cho discussion author giống reply.
13. Đồng nhất thứ tự reply newest-first.

## 8. DTO/type/service Frontend

Files:

- [studentCommunity.service.ts](FE/src/services/studentCommunity.service.ts)
- [managerDiscussion.service.ts](FE/src/services/managerDiscussion.service.ts)

Thay đổi type:

1. `createDiscussion` bỏ `courseId`.
2. `getTips` bỏ `courseId`.
3. `getDiscussions` không có `courseId`.
4. `DiscussionItem`/`DiscussionDetail` có `status`.
5. Xóa `course`/`CourseRefDto` nếu frontend không còn dùng.
6. `managerDiscussionService.list()` không nhận course id.
7. `managerDiscussionService.create()` không nhận course id.
8. Xóa `managerDiscussionService.setClosed()`.

## 9. Test plan

### Backend

1. Student có active enrollment bất kỳ tạo discussion thành công, không cần courseId.
2. Student không có active enrollment nhận 403.
3. Student có nhiều course vẫn chỉ cần một enrollment active.
4. Manager tạo discussion global thành công.
5. Public list không phụ thuộc course.
6. Mine list chỉ trả discussion của user hiện tại.
7. Không còn API manager close/reopen.
8. Manager gọi route student close/reopen không được phép.
9. Student author approved post close/reopen được.
10. Student không phải author không close/reopen được.
11. Pending/rejected/hidden không upvote/bookmark được.
12. Manager không Pin pending/rejected/hidden.
13. Hidden reply không làm sai public comment count.
14. Search `%`, `_`, `\` được xử lý như text thường.
15. DTO trả đúng `status` và không còn course field.
16. Resubmit clear `reviewedAt/reviewedBy/reviewNote`.

### Frontend

1. Student create modal không còn course field.
2. Student không có enrollment active không thể tạo post.
3. Student author thấy Close/Reopen.
4. Manager không thấy Close/Reopen.
5. Manager không còn course selector.
6. Manager list/create gọi đúng global endpoint.
7. Hidden badge và action visibility đúng theo `status`.
8. Reply order giống nhau ở student/manager.
9. Anonymous checkbox reset sau reply.
10. TypeScript build pass.

## 10. Thứ tự triển khai đề xuất

### Phase 1 - Contract và database

1. Chốt API global.
2. Tạo migration bỏ `discussions.course_id`.
3. Sửa entity/DTO/repository.
4. Sửa create/list authorization.

### Phase 2 - Quyền close và moderation

1. Xóa manager close endpoint/service/UI.
2. Giữ student close/reopen.
3. Chặn reaction không hợp lệ.
4. Chặn Pin bài chưa approved.
5. Sửa status và comment count.

### Phase 3 - Frontend

1. Bỏ course state/UI/API.
2. Đổi manager page sang global.
3. Cập nhật student create flow.
4. Cập nhật status/action rendering.
5. Sửa reply order, anonymous reset và wording.

### Phase 4 - Validation

1. Chạy backend unit/integration tests.
2. Chạy frontend typecheck/build.
3. Chạy lại browser flow cho student và manager.
4. Kiểm tra migration trên DB cũ và DB mới.

## 11. Điều kiện hoàn thành

- Discussion không còn foreign key hoặc field Course.
- Không còn `courseId` trong API/DTO/FE Discussion.
- Student chỉ cần có một active enrollment bất kỳ để đăng bài.
- Manager không có chức năng close/reopen.
- Student author là role duy nhất có thể close/reopen bài.
- Public/student count không tính reply hidden.
- Pending/rejected/hidden không thể reaction.
- Search wildcard hoạt động đúng.
- Contribution resubmit không giữ review metadata cũ.
- Backend tests, frontend typecheck/build và browser flow đều pass.

