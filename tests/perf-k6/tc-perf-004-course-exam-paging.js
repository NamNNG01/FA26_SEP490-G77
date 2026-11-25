import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ensureStudentToken, authHeaders } from './common.js';

// TC-PERF-004: Course list and exam list paging (100 concurrent users)
// Target: <= 2 s at p95, error rate < 1%
export const options = {
  vus: 100,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<=2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return {
    studentToken: ensureStudentToken(),
  };
}

export default function (data) {
  const page = __ITER % 3;
  const headers = authHeaders(data.studentToken);

  const cRes = http.get(`${BASE_URL}/api/v1/student/courses?page=${page}&size=12`, headers);
  check(cRes, { 'courses paging 200': (r) => r.status === 200 });

  const eRes = http.get(`${BASE_URL}/api/v1/student/my-exams?page=${page}&size=12`, headers);
  check(eRes, { 'exams paging 200': (r) => r.status === 200 });

  sleep(0.3);
}
