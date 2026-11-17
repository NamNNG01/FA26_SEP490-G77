# Plan: My Discussions Tab

## 1. Mục tiêu

Thêm tab **My Discussions** trong Community để học sinh xem các post do chính mình tạo, bao gồm cả:

- `PENDING`: đang chờ course manager duyệt.
- `APPROVED`: đã được duyệt và hiển thị công khai.
- `REJECTED`: bị từ chối, kèm lý do từ chối ở màn detail.
- Trạng thái nội dung: `OPEN`, `CLOSED`, `HIDDEN`.

Tab hiện tại `Discussions` vẫn giữ behavior public: chỉ hiển thị post đã `APPROVED` và không `HIDDEN`.

## 2. Hiện trạng cần tận dụng

### Backend

- Controller: `GET /api/v1/student/discussions`.
- Service đã có `listDiscussions(tag, search, sort, page, size, userId)`.
- Repository hiện có query public `findAllDiscussions(...)`.
- `DiscussionItemDto` đã có `approvalStatus`, `isClosed`, `isAuthor`, `tag`, `createdAt`, counters.
- Detail endpoint đã cho author xem post chưa duyệt và có `rejectionReason`.

### Frontend

- `StudentCommunityPage` đang có các tab `Discussions`, `Tips`, `Announcements`.
- `studentCommunity.service.ts` đã có `getDiscussions(...)`.
- Card/detail đã có thể hiển thị trạng thái pending/rejected ở detail.

## 3. API đề xuất

### 3.1 Mở rộng API list hiện tại

```http
GET /api/v1/student/discussions
```

Giữ default `scope=PUBLIC` để không breaking các client hiện tại.

#### Query parameters

| Parameter | Required | Values | Mô tả |
|---|---:|---|---|
| `scope` | No | `PUBLIC`, `MINE` | `PUBLIC` mặc định; `MINE` chỉ lấy post của user đăng nhập |
| `courseId` | No | number | Lọc theo khóa học; với `MINE`, chỉ trả post của user trong khóa được chọn |
| `tag` | No | `question`, `tip`, `announcement`, `ALL` | Lọc loại post |
| `approvalStatus` | No | `PENDING`, `APPROVED`, `REJECTED`, `ALL` | Dùng chủ yếu cho `scope=MINE`; mặc định `ALL` ở My Discussions |
| `status` | No | `OPEN`, `CLOSED`, `HIDDEN`, `ALL` | Lọc trạng thái nội dung |
| `search` | No | text, tối đa 100 ký tự | Tìm trong title/content |
| `sort` | No | `latest`, `mostCommented`, `mostUpvoted` | Sắp xếp |
| `page` | No | `>= 0` | Mặc định `0` |
| `size` | No | `1..100` | Mặc định `10` |

#### Ví dụ: My Discussions mặc định

```http
GET /api/v1/student/discussions?scope=MINE&approvalStatus=ALL&status=ALL&page=0&size=10
Authorization: Bearer <student-token>
```

#### Ví dụ: post bị reject trong một course

```http
GET /api/v1/student/discussions
    ?scope=MINE
    &courseId=12
    &approvalStatus=REJECTED
    &tag=question
    &sort=latest
    &page=0
    &size=10
```

#### Ví dụ response

```json
{
  "success": true,
  "data": {
    "content": [
      {
        "discussionId": 101,
        "title": "How does dependency injection work?",
        "excerpt": "I tried ...",
        "tag": "question",
        "author": {
          "userId": 42,
          "displayName": "Student A",
          "avatarUrl": null,
          "role": "STUDENT"
        },
        "upvoteCount": 0,
        "commentCount": 2,
        "isPinned": false,
        "isUpvoted": false,
        "isBookmarked": false,
        "isAuthor": true,
        "isClosed": false,
        "approvalStatus": "REJECTED",
        "createdAt": "2026-11-17T09:00:00Z",
        "lastCommentAt": "2026-11-17T09:05:00Z",
        "course": {
          "courseId": 12,
          "title": "Java Basics"
        }
      }
    ],
    "page": 0,
    "size": 10,
    "totalElements": 1,
    "totalPages": 1,
    "first": true,
    "last": true
  }
}
```

> Nếu không muốn expose object `course` trong các response cũ, thêm riêng `courseId` và `courseTitle` vào DTO thay vì bỏ `@JsonIgnore` trên field hiện tại.

### 3.2 Quy tắc authorization/filter

#### `scope=PUBLIC`

- Không cần đăng nhập nếu behavior hiện tại cho phép.
- Chỉ trả:
  - `approvalStatus = APPROVED`
  - `status <> HIDDEN`
- `courseId`, `tag`, `search`, `sort` vẫn hoạt động như feed hiện tại.
- Không cho client dùng `approvalStatus=PENDING/REJECTED` để đọc post của người khác.

#### `scope=MINE`

- Bắt buộc đăng nhập.
- Query bắt buộc `d.user.userId = currentUserId`.
- Cho phép xem post của chính mình ở mọi approval/status để theo dõi kết quả moderation.
- `approvalStatus=ALL` và `status=ALL` nghĩa là không thêm điều kiện tương ứng.
- Không tin `userId` từ query/body.
- Anonymous post vẫn trả `isAuthor=true`, nhưng không leak identity khác với behavior detail hiện tại.

### 3.3 Error cases

| Case | Status |
|---|---:|
| `scope` không hợp lệ | 400 |
| `approvalStatus`, `status`, `tag`, `sort` không hợp lệ | 400 |
| `page < 0` hoặc `size` ngoài `1..100` | 400 |
| `scope=MINE` không có authentication | 401/403 theo security convention |
| Course không tồn tại hoặc user không được phép filter course | 404/403 theo convention hiện tại |

## 4. Backend implementation plan

### 4.1 Controller

Mở rộng `StudentDiscussionController.listDiscussions(...)`:

```java
scope, courseId, tag, approvalStatus, status, search, sort, page, size
```

Không đổi path và giữ default để client cũ vẫn gọi được.

### 4.2 Service

Đổi service method thành dạng filter rõ ràng, ưu tiên request object nếu số query param tăng nhiều:

```java
Page<DiscussionItemDto> listDiscussions(
    DiscussionListFilter filter,
    Long currentUserId
);
```

Các bước:

1. Validate/normalize enum filter.
2. Resolve `scope`.
3. Với `MINE`, yêu cầu `currentUserId != null`.
4. Chọn approval/status predicate theo scope.
5. Load upvotes/bookmarks theo batch như logic hiện tại.
6. Map DTO và giữ `isAuthor` chính xác.

### 4.3 Repository

Thêm query riêng dễ đọc, thay vì làm public query hiện tại quá phức tạp:

```java
Page<Discussion> findMineDiscussions(
    Long userId,
    Long courseId,
    String tag,
    String approvalStatus,
    String status,
    String search,
    String sort,
    Pageable pageable
);
```

Query phải có:

```sql
d.user.userId = :userId
AND (:courseId IS NULL OR d.course.courseId = :courseId)
AND (:tag IS NULL OR d.tag = :tag)
AND (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus)
AND (:status IS NULL OR d.status = :status)
```

Với public feed, giữ query hiện tại hoặc refactor thành predicate dùng chung nhưng không làm thay đổi điều kiện `APPROVED` + non-hidden.

### 4.4 DTO

Đảm bảo My Discussions có đủ thông tin để filter/card:

- `approvalStatus`
- `isClosed`
- `rejectionReason` nếu product muốn hiển thị ngay trên list; nếu không thì chỉ lấy trong detail
- `courseId/courseTitle` hoặc `course` để user biết post thuộc course nào

Không expose `rejectionReason` của post người khác trong public feed.

## 5. Frontend implementation plan

### 5.1 Tabs

Đổi tabs thành:

```text
Discussions | My Discussions | Tips | Announcements
```

- `Discussions`: gọi `scope=PUBLIC`, behavior hiện tại.
- `My Discussions`: gọi `scope=MINE`.
- `Tips` và `Announcements`: giữ flow hiện tại hoặc đưa vào filter tương ứng sau khi API thống nhất.

### 5.2 Filter UI cho My Discussions

Hiển thị:

- Course: `All courses` + active enrolled courses.
- Approval status: `All`, `Pending`, `Approved`, `Rejected`.
- Content status: `All`, `Open`, `Closed`, `Hidden`.
- Tag: `All`, `Question`, `Tip`, `Announcement`.
- Search title/content.
- Sort: `Latest`, `Most commented`, `Most upvoted`.

Mỗi lần đổi filter:

1. Reset `page=0`.
2. Gọi lại API.
3. Giữ debounce 300ms cho search.
4. Hiển thị loading/error/empty state riêng cho tab.

### 5.3 Card/detail behavior

- Card hiển thị badge `Pending`, `Approved`, `Rejected`, `Closed`.
- Post rejected hiển thị rejection reason ở detail.
- Author được mở detail của pending/rejected/hidden post của chính mình.
- Không hiển thị action upvote/comment nếu post closed hoặc chưa approved theo rule hiện tại.
- Sau khi create post từ My Discussions, reload tab để post mới xuất hiện với `PENDING`.

### 5.4 Frontend service

Đổi type params:

```ts
type DiscussionScope = 'PUBLIC' | 'MINE';
type DiscussionStatus = 'OPEN' | 'CLOSED' | 'HIDDEN' | 'ALL';
type DiscussionApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

getDiscussions(params: {
  scope?: DiscussionScope;
  courseId?: number;
  tag?: DiscussionTag | 'ALL';
  approvalStatus?: DiscussionApprovalStatus;
  status?: DiscussionStatus;
  search?: string;
  sort?: DiscussionSort;
  page?: number;
  size?: number;
});
```

## 6. Test plan

### Backend integration tests

1. Student tạo post thì `scope=MINE` thấy post `PENDING`.
2. Manager approve thì post chuyển thành `APPROVED`.
3. Manager reject thì `scope=MINE&approvalStatus=REJECTED` thấy post.
4. `scope=MINE` không thấy post của student khác.
5. `scope=MINE&status=CLOSED` chỉ trả post closed.
6. `scope=MINE&tag=tip` và `courseId` filter đúng.
7. Public feed không trả `PENDING`, `REJECTED`, `HIDDEN`.
8. Student không thể dùng query param để xem post của user khác.
9. Pagination, search và sort hoạt động với từng scope.
10. Anonymous post vẫn map `isAuthor=true` cho owner nhưng không leak identity khi đọc public.

### Frontend checks

1. Tab chuyển đúng endpoint/scope.
2. Filter reset pagination.
3. Rejected/pending badge và empty state đúng.
4. Refresh sau create/approve/reject phản ánh trạng thái mới.
5. TypeScript build pass.

## 7. Definition of Done

- My Discussions hiển thị đầy đủ post của user hiện tại, không lẫn post người khác.
- Có filter course, tag, approval status, content status, search, sort và pagination.
- Public Discussions không bị thay đổi behavior.
- Pending/rejected/hidden post vẫn xem được bởi author theo đúng authorization.
- Backend có integration tests cho scope/filter/security.
- FE build và targeted backend tests pass.
