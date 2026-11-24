import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, {
    'login status 200': (r) => r.status === 200,
  });
  const body = res.json();
  return body && body.data ? body.data.accessToken : '';
}

export function ensureStudentToken() {
  if (__ENV.STUDENT_EMAIL && __ENV.TEST_PASSWORD) {
    return login(__ENV.STUDENT_EMAIL, __ENV.TEST_PASSWORD);
  }
  const email = `k6_perf_${Date.now()}@example.test`;
  const password = 'Password123!';
  http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({ email, password, fullName: 'K6 Perf Student' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return login(email, password);
}

export function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}
