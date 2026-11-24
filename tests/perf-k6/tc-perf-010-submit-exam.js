import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, login, authHeaders } from './common.js';

// TC-PERF-010: Submit exam with 100 concurrent submissions
// Target: <= 3 s at p95, error rate < 1%
export const options = {
  scenarios: {
    concurrent_submit: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<=3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return {
    studentToken: login(__ENV.STUDENT_EMAIL || 'student1@gmail.com', __ENV.TEST_PASSWORD || 'Password123!'),
    examId: __ENV.EXAM_ID || '1',
  };
}

export default function (data) {
  const headers = authHeaders(data.studentToken);
  const startRes = http.post(`${BASE_URL}/api/v1/student/exams/${data.examId}/attempts`, null, headers);
  const okStart = check(startRes, { 'start attempt 200/201': (r) => r.status === 200 || r.status === 201 });
  if (!okStart) return;

  const attemptId = startRes.json()?.data?.attemptId || startRes.json()?.data?.id;
  if (!attemptId) return;

  const submitRes = http.post(`${BASE_URL}/api/v1/student/attempts/${attemptId}/submit`, null, headers);
  check(submitRes, { 'submit attempt 200': (r) => r.status === 200 });
}
