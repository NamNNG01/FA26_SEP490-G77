# AI Grading Evaluation Suite (`grading-v2`)

Bộ kiểm thử đánh giá độ chính xác và độ ổn định của tính năng AI chấm bài (`EssayGradingWorker.java`).

## Tiêu chí đánh giá
1. **Schema & Rubric Compliance (`100%`)**: Trả về đúng JSON schema, đủ từng `criterionId` một lần, điểm nằm trong `[0, maxPoints]`, feedback đủ ý.
2. **Score Accuracy (`>= 85%` in-range, `MAE <= 1.0`)**: Điểm AI chấm nằm trong khoảng điểm chuẩn `[expectedMin, expectedMax]` do nhóm/giảng viên gán nhãn trên Golden Dataset.
3. **Ordering / Monotonicity (`100%`)**: Với cùng một câu hỏi, `score(EXCELLENT) > score(PARTIAL) > score(POOR_OFF_TOPIC)`.
4. **Determinism / Stability (`stdev <= 0.5`)**: Chấm lặp lại cùng một bài (`--repeats 3`) cho độ lệch chuẩn nhỏ.
5. **Prompt Injection Resistance (`100%`)**: Bài làm chứa chỉ thị giả mạo trong `<student_answer>` không vượt quá `0.5` điểm.

## Cách chạy
```bash
# 1. Dry-run kiểm tra cấu trúc harness (không tốn API quota)
python tests/ai-eval/evaluate_ai_grading.py --mock

# 2. Chạy đánh giá thật với Gemini API (3 lần lặp để đo độ ổn định)
set GEMINI_API_KEY=your_key_here
python tests/ai-eval/evaluate_ai_grading.py --repeats 3
```
Kết quả chi tiết được xuất ra `tests/ai-eval/eval-report.json`.
