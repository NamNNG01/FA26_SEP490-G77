# ExamPrep — Implementation Plan (BE & FE Split)

- **Ngày chốt plan:** 2026-11-21
- **Nguồn:** Master Defect Backlog & Fix Plan (21 work items) + 9 quyết định BA/Product đã chốt
- **Mục tiêu:** Tách rõ đầu việc độc lập cho **Backend (BE)**, **Frontend (FE)** và **QA**, ưu tiên theo thứ tự **Sprint A (P0) → Sprint B (P1) → Sprint C (P2)**.

---

## 1. Các quyết định đã chốt (Baseline trước khi code)

| # | Mã Defect | Quyết định đã chốt | Tác động |
|---|---|---|---|
| 1 | `DEF-BF07-03` | Mỗi câu `CODE` chỉ có **đúng 1 language**; các câu cũ `[]` trong DB migrate sang **`JAVA`**. | BE + DB Migration |
| 2 | `DEF-BF07-04` | `POST /student/code-exams/run` chạy **độc lập, không gắn với exam/attempt** (giữ rule hiện tại theo enrollment). | QA cập nhật TC `ST-BF07-34` |
| 3 | `DEF-BF03-06` | **Option A:** Module là **bắt buộc** khi tạo/lưu câu hỏi AI Generate. | FE sửa UI (BE giữ `moduleId` required) |
| 4 | `DEF-BF03-07` | **Option B:** Giữ khóa hoàn toàn (`409`) khi exam đã `PUBLISHED` và có attempts. | QA cập nhật TC `ST-BF03-22` |
| 5 | `DEF-BF06-01` | Hỗ trợ `minWords`/`maxWords` trong `questionMetadata`; **cảnh báo mềm (warning)** ở UI khi ngoài ngưỡng (vẫn cho nộp; giữ trần cứng `10,000` chars ở BE). | BE + FE |
| 6 | `DEF-BF06-02` | **Bỏ `passMark`** (chính thức deprecated). | QA đóng `ST-BF06-08` (Won't Fix) |
| 7 | `DEF-BF07-02` | Thống nhất **1 ngưỡng chung theo UTF-8 bytes = `64 KB` (`65,536` bytes)** dưới trần Piston cho cả Run, Submit và Draft. | BE + FE |
| 8 | `DEF-BF03-05` | **Option A:** Giữ idempotent `200 "Submitted"` khi submit trùng. | QA cập nhật TC `ST-BF03-50` |
| 9 | `REQ-FC-06` | Giữ cơ chế lướt `Next` tự đánh `KNOWN` như hiện tại. | Không sửa code (By Design) |

> **Các mục đóng ngay (không cần sửa code BE/FE):** `DEF-BF07-04`, `DEF-BF03-05`, `DEF-BF03-07`, `DEF-BF06-02`, `REQ-FC-06`.

---

## 2. Kế hoạch cho Backend (BE)

### Sprint A — Chặn lỗi nghiêm trọng (P0)

#### 1. `DEF-BF07-01` — Lưu & trả `language` cho câu trả lời `CODE`
- **Endpoints / Files:**
  - `POST /api/v1/student/code-exams/submit` (`StudentCodeExamServiceImpl.persistSubmit`)
  - `PUT /api/v1/student/attempts/{attemptId}/answers` (`StudentAttemptServiceImpl` → `AnswerResponseValidator`)
  - `GET /api/v1/student/attempts/{attemptId}` (`SA-02`)
- **Việc cần làm:**
  1. Trong `persistSubmit`: lưu `response = {"text": source, "language": planned.language()}` thay vì chỉ `{"text": source}`.
  2. Trong `AnswerResponseValidator` (`case "CODE"`): nhận field `language` (optional nếu single-language default, nhưng nếu có phải thuộc `PistonClient.supports` và khớp `allowedLanguages` của câu hỏi) và lưu cùng `text`.
  3. Trong `SA-02`: trả `language` trong `response` của câu `CODE`.
- **Verify:** Lưu draft `{text, language: "PYTHON"}` → gọi `SA-02` trả về `language = "PYTHON"`; gọi `CD-05` với `PYTHON` → response lưu `language = "PYTHON"`.

#### 2. `DEF-BF07-05` — Cô lập kết quả `CodeSubmission` theo `attemptId`
- **Endpoints / Files:**
  - `GET /api/v1/student/code-exams/{examId}/submissions` (`StudentCodeExamServiceImpl.submissions`, `CodeExamResponses.SubmissionItem`, `CodeSubmissionRepository`)
- **Việc cần làm:**
  1. Bổ sung `attemptId` (`row.getAttempt().getAttemptId()`) vào `CodeExamResponses.SubmissionItem`.
  2. Hỗ trợ query param tùy chọn `?attemptId=` trên `GET /student/code-exams/{examId}/submissions` để lọc đúng submissions của attempt đó.
- **Verify:** Attempt `445` có submission và attempt `447` không có submission → `?attemptId=447` trả danh sách rỗng; mỗi item luôn có `attemptId`.

#### 3. `DEF-BF07-06` — Auto-submit khi hết giờ phải chấm câu `CODE`
- **Endpoints / Files:**
  - `POST /api/v1/student/code-exams/submit` (`StudentCodeExamServiceImpl.persistSubmit`)
  - `POST /api/v1/student/attempts/{attemptId}/submit` & `AttemptAutoSubmitter.gradeAndClose`
- **Việc cần làm:**
  1. Trong `persistSubmit`: bỏ kiểm tra deadline lần 2 sau khi Piston chạy xong, chỉ kiểm tra attempt vẫn còn `IN_PROGRESS` (tránh lỗi `409` khi Piston chạy mất vài giây sát giờ nộp).
  2. Trong `AttemptAutoSubmitter.gradeAndClose` (và submit thường): nếu câu `CODE` chưa được `CD-05` chấm mà đã có draft `text`/`language` lưu sẵn, thực hiện chấm qua Piston **ngoài DB transaction**, lưu `CodeSubmission` và cập nhật điểm all-or-nothing.
  3. Nếu sandbox lỗi khi auto-submit, set `gradingStatus = FAILED`, `scoreEarned = 0`, ghi `gradingError` — tuyệt đối không để câu `CODE` đã đóng nằm ở `PENDING_AI`.
- **Verify:** Đề 1 phút có code đúng trong draft → hết giờ `autoSubmitted = true`, câu `CODE` có `CodeSubmission` và đạt `10/10`.

#### 4. `DEF-FC-01` — `resetProgress` giữ lại `is_starred` *(Đề xuất: Nam)*
- **Files:** `StudentStudyService.resetProgress`
- **Việc cần làm:**
  1. Không gọi `deleteByUserUserIdAndCardDeckDeckId(...)` xóa toàn bộ bảng `user_card_progress`.
  2. Chỉ xóa các row `is_starred = false`; các row `is_starred = true` cập nhật `status = 'NEW'`, `wrong_count = 0`, `last_reviewed_at = NULL` (giữ nguyên `is_starred = true`) trong transaction.
- **Verify:** Star thẻ → `PUT /student/decks/{id}/progress/reset` → tiến độ về 0 nhưng `starredCount` và `isStarred` giữ nguyên.

---

### Sprint B — Hợp đồng API & Dữ liệu (P1)

#### 5. `DEF-BF07-02` — Thống nhất giới hạn source `64 KB` (UTF-8 bytes)
- **Files:** `CodeExamRequests.java`, `AnswerResponseValidator.java`, `StudentCodeExamServiceImpl.java`, `PistonClient.java`
- **Việc cần làm:**
  1. Định nghĩa constant chung `CODE_MAX_BYTES = 65_536` (`64 KB` UTF-8 bytes) cho `CD-04` (`/run`), `CD-05` (`/submit`), và `PUT /attempts/{id}/answers` (`case "CODE"` thay cho `ESSAY_MAX_CHARS = 10_000`).
  2. Validate theo `sourceCode.getBytes(StandardCharsets.UTF_8).length <= 65_536`; vượt ngưỡng trả **`400`** (`SOURCE_TOO_LARGE`, `"Code is larger than 64 KB."`).
  3. Trong `PistonClient.execute`: map lỗi `4xx` từ sandbox provider (400/413) thành `400` thay vì `503`; chỉ trả `503` khi `5xx` hoặc không kết nối được.
- **Verify:** 50 KB ASCII lưu/chạy bình thường; 40,010 ký tự tiếng Việt (> 64 KB UTF-8) trả `400`, không bao giờ trả `503`.

#### 6. `DEF-BF07-03` — Validate đúng 1 `allowedLanguages` + Migration sang `JAVA`
- **Files:** `QuestionValidator.java`, `QuestionServiceImpl.java`, `GlobalExceptionHandler.java`, Flyway migration mới (kiểm tra số version tiếp theo trên repo, tránh trùng)
- **Việc cần làm:**
  1. `QuestionValidator`: với `questionType = CODE`, bắt buộc `codeConfig.allowedLanguages` có **đúng 1 phần tử** hợp lệ (`missing` / `[]` / `> 1` → trả **`400`** field error).
  2. `GlobalExceptionHandler.handleDataIntegrityViolation`: tách lỗi `unique constraint` (`409`) khỏi lỗi `NOT NULL` / `CHECK constraint` (`400` hoặc `500` + log).
  3. Viết Flyway migration backfill các dòng `code_question_configs` đang có `allowed_languages = '[]'` hoặc `NULL` thành `'["JAVA"]'`.
- **Verify:** Tạo câu CODE thiếu `allowedLanguages` → `400` field error (không phải `409`); dữ liệu cũ `[]` chuyển sang `["JAVA"]`.

#### 7. `DEF-BF06-01` — Hỗ trợ `minWords` / `maxWords` trong `questionMetadata`
- **Files:** `QuestionValidator.java`, `QuestionServiceImpl` / DTO trả về question detail
- **Việc cần làm:**
  1. Mở whitelist trong `QuestionValidator` cho `minWords` và `maxWords` (số nguyên dương, nếu có cả hai thì bắt buộc `minWords <= maxWords`, sai → `400`).
  2. Persist và trả lại `minWords` / `maxWords` trong `questionMetadata` của Manager & Student exam detail (không chặn cứng khi student nộp bài vì dùng cảnh báo mềm ở FE; vẫn giữ trần `ESSAY_MAX_CHARS = 10_000` bảo vệ payload).
- **Verify:** Tạo/sửa câu ESSAY với `minWords: 50, maxWords: 200` → `201/200`, GET trả về đúng metadata; `minWords > maxWords` → `400`.

#### 8. `DEF-MQ-01` — Trả `quizTitle` trong `GET /api/v1/student/materials`
- **Files:** `StudentMaterialController` / `JobBrief` DTO / `StudentMaterialServiceImpl`
- **Việc cần làm:**
  1. Bổ sung `quizTitle` vào `JobBrief` (`MQ-02`):
     - Job `COMPLETED`: lấy `resultExam.title`.
     - Job `PENDING` / `PROCESSING`: lấy `job.title`.
     - Job cũ không có title: fallback `"Quiz from material " + material.title`.
  2. Dùng projection hoặc batch query để tránh N+1 query. Không tạo migration `V73` trùng.

---

### Sprint C — Integration Tests Baseline (P2)

#### 9. `OBS-FC-TEST-01` & `StudentAiApiIntegrationTest`
- **Việc cần làm:**
  1. Điều tra và sửa 2 test fail sẵn trên `main` trong `StudentDeckApiIntegrationTest` (`listCourseShowsOnlyDecksWithLearnedCountAtLeastOne`, `managerListsStudentContributedDecksAtTheDeckListEndpoint`).
  2. Cập nhật fixture user trong `StudentAiApiIntegrationTest` (gắn gói có quyền `AI_ESSAY_GRADING`) để 5 test bị `403` chạy pass lại.

---

## 3. Kế hoạch cho Frontend (FE)

### Sprint A — Chặn lỗi nghiêm trọng (P0)

#### 1. `DEF-BF07-01` — Khôi phục đúng `language` của CODE sau reload *(Chờ BE trả `language` ở `SA-02`)*
- **Files:** `CodeQuestionWorkspace.tsx` (và service lưu draft)
- **Việc cần làm:**
  1. Khi đổi/chọn ngôn ngữ hoặc autosave draft `PUT /answers`, gửi kèm `language` cùng `text`.
  2. Khi mở/reload attempt (`SA-02`), đọc `response.language` để set lại ngôn ngữ của editor; chỉ fallback mặc định khi `response.language` chưa có.
  3. Khi bấm Finish/Submit (`CD-05`), gửi đúng `language` hiện tại của bài làm.

#### 2. `DEF-BF07-05` — Lọc kết quả `CodeSubmission` theo `attemptId` *(Chờ BE trả `attemptId` ở `CD-07`)*
- **Files:** `StudentExamResultPage.tsx`, code exam API service
- **Việc cần làm:**
  1. Gọi `GET /student/code-exams/{examId}/submissions?attemptId={attemptId}` (và/hoặc lọc client-side `s.attemptId === currentAttemptId`) để không hiển thị nhầm test case của attempt khác.
  2. Nếu draft code đã được lưu kể cả khi chấm lỗi, hiển thị đúng source code trong mục `YOUR ANSWER`.

#### 3. `DEF-BF07-06` — Tránh rớt nộp code sát deadline `00:00` *(Phối hợp BE)*
- **Files:** `CodeQuestionWorkspace.tsx` / timer auto-submit handler
- **Việc cần làm:**
  1. Đảm bảo draft code mới nhất luôn được flush/autosave trước khi timer về 0; không gửi `CD-05` trễ sau deadline gây 409 nếu BE đã đảm nhận auto-grade từ draft khi hết giờ.

---

### Sprint B — Hợp đồng API & Form Validation (P1)

#### 4. `DEF-BF07-02` — Đồng bộ giới hạn `64 KB` UTF-8 bytes trên UI
- **Files:** `CodeQuestionWorkspace.tsx`
- **Việc cần làm:**
  1. Dùng `new Blob([sourceCode]).size <= 65536` (hoặc `TextEncoder().encode(sourceCode).length <= 65536`) để khớp 100% với BE.
  2. Cập nhật thông báo lỗi thành `"Code is larger than 64 KB."` và disable nút Run/Submit khi vượt ngưỡng.

#### 5. `DEF-BF03-06` — Bắt buộc chọn Module trên màn AI Generate
- **Files:** Form tạo câu hỏi / đề bằng AI (`Create Exam > AI Generate`)
- **Việc cần làm:**
  1. Bỏ nhãn "(optional)" ở trường Module; đánh dấu `*` bắt buộc (`required`).
  2. Disable hoặc báo validation `"Please select a module."` trước khi cho Generate/Save nếu chưa chọn Module.

#### 6. `DEF-BF06-01` — Nhập & cảnh báo mềm `minWords` / `maxWords` cho Essay *(Phối hợp BE)*
- **Files:** Form tạo/sửa câu hỏi Essay (Manager) + màn hình làm bài Essay (Student)
- **Việc cần làm:**
  1. Manager: thêm 2 input tùy chọn `Min words` / `Max words` (validate `minWords <= maxWords` trên form), gửi trong `questionMetadata`.
  2. Student: giữ nguyên counter số từ hiện tại; nếu câu hỏi có `minWords`/`maxWords` và bài viết đang ngoài khoảng đó, hiển thị **cảnh báo mềm (warning badge/text)** ở editor và hộp xác nhận trước khi nộp (vẫn cho phép bấm `Submit exam`).

#### 7. `DEF-MQ-01` — Hiển thị `quizTitle` trong My Materials *(Chờ BE trả `quizTitle` ở `MQ-02`)*
- **Files:** `studentMaterial.service.ts`, `MyMaterialsPage.tsx`, `MaterialQuizModal.tsx`
- **Việc cần làm:**
  1. Thêm `quizTitle?: string` vào interface `MaterialJobBrief`.
  2. Trên `MyMaterialsPage`: ưu tiên render `job.quizTitle` thay cho label `"Quiz 1"`, `"Quiz 2"` (chỉ fallback nếu job cũ không có `quizTitle`).
  3. Trên `MaterialQuizModal` (trạng thái hoàn tất): hiển thị tên quiz vừa tạo.

---

### Sprint C — UX & Polish (P2)

#### 8. `DEF-FC-02..05` — Hoàn thiện UX Flashcard *(Đề xuất: Hiếu)*
- **Files:** `StudyPanel.tsx`, `StudentDeckStudyPage.tsx`, `StudentDeckLearnPage.tsx`
- **Việc cần làm:**
  1. **`DEF-FC-02`:** Thêm mode `'starred'` vào `StudyPanel.begin()` (`cards.filter(c => c.isStarred)`), thêm nút **`Review starred cards (n)`** và icon star trên danh sách thẻ của `StudentDeckStudyPage`.
  2. **`DEF-FC-03`:** Trong `StudentDeckLearnPage`, bổ sung cleanup gọi `finish` (có guard chống gọi trùng) khi rời trang bằng nút Back hoặc chuyển route qua sidebar.
  3. **`DEF-FC-04`:** Khi Learn đạt 100%, invalidate/refetch lại `LP-01` (`courseProgress`) hoặc trigger đồng bộ tiến độ ngay để quay về deck/course thấy `%` mới ngay lập tức.
  4. **`DEF-FC-05`:** Sửa toast sau `Mark all learned` từ `"Every card is marked as learned."` sang thông báo đúng số lượng thực tế từ API (ví dụ `"Marked X / Y cards as learned."`).

#### 9. `OBS-BF06-01` & `OBS-BF06-02` — UI/Network Polish cho Essay Exam
- **Files:** Trang Start/Retake Exam & `StudentExamResultPage.tsx`
- **Việc cần làm:**
  1. **`OBS-BF06-01`:** Thêm in-flight guard / ref (hoặc `useRef` lock) cho thao tác Start/Retake attempt để tránh bắn 2 request `POST /student/exams/{id}/attempts` song song gây `409` thừa dưới StrictMode.
  2. **`OBS-BF06-02`:** Sửa `flex-wrap`, `gap` và `min-w-0` cho cụm nút `Grade with AI` và `Retake` trên header `StudentExamResultPage` để không bị chồng lấn ở desktop/mobile.

---

## 4. Kế hoạch cho QA (Cập nhật Test Case & Retest)

1. **Cập nhật Test Case theo rule mới đã chốt:**
   - `ST-BF07-34`: Cập nhật kỳ vọng thành cho phép chạy độc lập theo course enrollment (hoặc đóng theo rule mới).
   - `ST-BF03-22`: Cập nhật kỳ vọng thành `409 Conflict` khi exam đã `PUBLISHED` & có attempts.
   - `ST-BF03-50`: Cập nhật kỳ vọng thành idempotent `200 "Submitted"`.
   - `ST-BF06-08`: Đóng / bỏ `passMark` theo quyết định deprecated.
2. **Checklist Retest sau khi BE + FE hoàn thành:**
   - **Sprint A:** Python code reload vẫn giữ Python & chấm 10/10; auto-submit hết giờ chấm được CODE hoặc `FAILED/0`; result chỉ hiện submission của đúng attempt; Flashcard reset progress giữ nguyên star.
   - **Sprint B:** Source > `64 KB` UTF-8 trả `400` đồng nhất FE/BE (không `503`); tạo câu CODE thiếu/nhiều hơn 1 language trả `400`; AI Generate bắt buộc chọn Module; Essay `minWords`/`maxWords` lưu & hiện cảnh báo mềm; My Materials hiện đúng `quizTitle`.
   - **Sprint C:** `Review starred cards`, rời Learn bằng Back không treo session, Learn 100% cập nhật course progress ngay, toast Mark all learned đúng số liệu, không còn `409` thừa và overlap nút ở Result header, toàn bộ integration tests `BE` pass.
