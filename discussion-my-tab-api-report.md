# Backend API Report: My Discussions

## Status

Backend đã hỗ trợ list discussion theo scope `PUBLIC` hoặc `MINE`.

- Endpoint: `GET /api/v1/student/discussions`
- Không có endpoint mới nên FE có thể reuse service `getDiscussions`.
- `scope` mặc định là `PUBLIC`, giữ tương thích với API cũ.
- `scope=MINE` bắt buộc có access token.

## Request

```http
GET /api/v1/student/discussions
Authorization: Bearer <student-token>
```

### Query parameters

| Parameter | Default | Values | Ghi chú |
|---|---|---|---|
| `scope` | `PUBLIC` | `PUBLIC`, `MINE` | `MINE` chỉ trả post của user hiện tại |
| `tag` | - | `question`, `tip`, `announcement`, `ALL` | Bỏ qua filter khi `ALL` |
| `approvalStatus` | - | `PENDING`, `APPROVED`, `REJECTED`, `ALL` | Hữu ích với `MINE` |
| `status` | - | `OPEN`, `CLOSED`, `HIDDEN`, `ALL` | Trạng thái nội dung |
| `search` | - | text | Tìm title/content, tối đa 100 ký tự |
| `sort` | `latest` | `latest`, `mostCommented`, `mostUpvoted` | |
| `page` | `0` | integer >= 0 | Page bắt đầu từ 0 |
| `size` | `10` | integer 1..100 | |

### Ví dụ FE

#### Tất cả post của học sinh

```http
GET /api/v1/student/discussions?scope=MINE&approvalStatus=ALL&status=ALL&page=0&size=10
```

#### Chỉ post bị reject

```http
GET /api/v1/student/discussions?scope=MINE&approvalStatus=REJECTED&sort=latest&page=0&size=10
```

#### Lọc theo tag và trạng thái đóng

```http
GET /api/v1/student/discussions?scope=MINE&tag=question&status=CLOSED&page=0&size=10
```

## Response

Response dùng format pagination hiện tại:

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
        "imageUrl": null,
        "approvalStatus": "REJECTED",
        "createdAt": "2026-11-17T09:00:00Z",
        "lastCommentAt": "2026-11-17T09:05:00Z"
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

## Visibility and authorization

### `scope=PUBLIC`

- Chỉ trả `approvalStatus=APPROVED`.
- Không trả post có `status=HIDDEN`.
- Các giá trị `approvalStatus`/`status` gửi lên không làm lộ post pending/rejected/hidden.
- Có thể dùng cho tab Discussions hiện tại.

### `scope=MINE`

- Bắt buộc authentication.
- Backend luôn filter `discussion.user.userId = currentUserId`; FE không truyền `userId`.
- Có thể trả post `PENDING`, `APPROVED`, `REJECTED` và `HIDDEN` của chính user.
- `approvalStatus=ALL`, `status=ALL` hoặc bỏ parameter nghĩa là không lọc field đó.

## Error cases

- `401/403`: gọi `scope=MINE` khi chưa đăng nhập.
- `400`: scope, tag, status, approvalStatus hoặc sort không hợp lệ.
- `400`: page âm hoặc size ngoài khoảng 1..100.

## FE integration notes

```ts
getDiscussions({
  scope: 'MINE',
  tag,
  approvalStatus,
  status,
  search,
  sort,
  page,
  size
})
```

- Khi đổi filter, reset `page` về `0`.
- Tab My Discussions nên dùng mặc định `scope=MINE`, `approvalStatus=ALL`, `status=ALL`.
- Hiển thị badge theo `approvalStatus` và `isClosed`.
- Detail API hiện tại vẫn là:
  `GET /api/v1/student/discussions/{discussionId}`.
- `rejectionReason` nằm ở detail response, không nằm trong list response.

## Backend changes

- Thêm repository query `findMineDiscussions(...)` có ownership predicate.
- Mở rộng `StudentDiscussionController` và `StudentDiscussionService`.
- Khai báo trực tiếp `scope` và các filter trong `listDiscussions` của controller/service.
- Thêm unit test cho owner/status filtering và authentication requirement.
