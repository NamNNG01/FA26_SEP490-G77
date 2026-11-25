import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, authHeaders } from './common.js';

// TC-PERF-003: Search questions in the Question Bank (seeded 50,000 questions)
// Target: <= 2 s at p95, error rate < 1%
export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<=2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const KEYWORDS = ['security', 'database', 'network', 'java', 'cloud', 'exam'];

export function setup() {
  return {
    managerToken: login(__ENV.MANAGER_EMAIL || 'manager@gmail.com', __ENV.TEST_PASSWORD || 'Password123!'),
  };
}

export default function (data) {
  const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
  const res = http.get(
    `${BASE_URL}/api/v1/manager/questions?keyword=${encodeURIComponent(kw)}&page=0&size=20`,
    authHeaders(data.managerToken)
  );
  check(res, { 'question search 200': (r) => r.status === 200 });
  sleep(0.3);
}
