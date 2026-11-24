import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, ensureStudentToken, authHeaders } from './common.js';

// TC-PERF-002: Dashboard loading with 100 concurrent users
// Target: <= 3 s at p95, error rate < 1%
export const options = {
  vus: 100,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<=3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const data = {
    studentToken: ensureStudentToken(),
  };
  if (__ENV.MANAGER_EMAIL && __ENV.TEST_PASSWORD) {
    data.managerToken = login(__ENV.MANAGER_EMAIL, __ENV.TEST_PASSWORD);
  }
  if (__ENV.ADMIN_EMAIL && __ENV.TEST_PASSWORD) {
    data.adminToken = login(__ENV.ADMIN_EMAIL, __ENV.TEST_PASSWORD);
  }
  return data;
}

export default function (data) {
  const r1 = http.get(`${BASE_URL}/api/v1/dashboard/student`, authHeaders(data.studentToken));
  check(r1, { 'student dashboard 200': (r) => r.status === 200 });

  if (data.managerToken) {
    const r2 = http.get(`${BASE_URL}/api/v1/dashboard/course-manager`, authHeaders(data.managerToken));
    check(r2, { 'manager dashboard 200': (r) => r.status === 200 });
  }
  if (data.adminToken) {
    const r3 = http.get(`${BASE_URL}/api/v1/dashboard/admin`, authHeaders(data.adminToken));
    check(r3, { 'admin dashboard 200': (r) => r.status === 200 });
  }

  sleep(0.5);
}
