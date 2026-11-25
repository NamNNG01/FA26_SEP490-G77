# Performance Load Test Suite (k6)

Bộ script giả lập tải bằng **k6** cho các test case Performance trong `reports/Delivery/Report-5.4_System Test_NFRs.xlsx`.

## Cài đặt k6 (Windows)
```powershell
winget install k6 --source winget
```

## Chạy từng kịch bản
```powershell
$env:BASE_URL = "http://localhost:8080"
$env:TEST_PASSWORD = "your_test_password"

k6 run tests/perf-k6/tc-perf-002-dashboard.js
k6 run tests/perf-k6/tc-perf-003-question-search.js
k6 run tests/perf-k6/tc-perf-004-course-exam-paging.js
k6 run tests/perf-k6/tc-perf-010-submit-exam.js
```
Sau khi chạy, ghi nhận giá trị `http_req_duration p(95)` và `http_req_failed` vào cột `Actual` và `Status` của sheet `Performance` trong `Report-5.4_System Test_NFRs.xlsx`.
