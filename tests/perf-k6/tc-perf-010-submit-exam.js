import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, authHeaders } from './common.js';

// TC-PERF-010: Submit exam with 100 concurrent submissions
// Target: <= 3 s at p95, error rate < 1%
const VUS = 100;

export const options = {
  scenarios: {
    concurrent_submit: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<=3000'],
    http_req_failed: ['rate<0.01'],
  },
  setupTimeout: '120s',
};

export function setup() {
  const courseId = __ENV.COURSE_ID || '30';
  const examId = __ENV.EXAM_ID || '212';
  const ts = Date.now();
  const pw = 'Password123!';
  const jsonHdr = { headers: { 'Content-Type': 'application/json' } };

  // Register & login 100 distinct students in batches so each VU has its own attempt
  const regReqs = [];
  const loginReqs = [];
  for (let i = 0; i < VUS; i++) {
    const email = `k6_sub_${ts}_${i}@example.test`;
    regReqs.push(['POST', `${BASE_URL}/api/v1/auth/register`, JSON.stringify({ email, password: pw, fullName: `K6 ${i}` }), jsonHdr]);
    loginReqs.push(['POST', `${BASE_URL}/api/v1/auth/login`, JSON.stringify({ email, password: pw }), jsonHdr]);
  }
  for (let off = 0; off < VUS; off += 25) {
    http.batch(regReqs.slice(off, off + 25));
  }
  const tokens = [];
  for (let off = 0; off < VUS; off += 25) {
    const resps = http.batch(loginReqs.slice(off, off + 25));
    for (const r of resps) {
      tokens.push(r.json()?.data?.accessToken || '');
    }
  }

  const enrollReqs = tokens.map((t) => ['POST', `${BASE_URL}/api/v1/student/courses/${courseId}/enroll`, null, authHeaders(t)]);
  for (let off = 0; off < VUS; off += 25) {
    http.batch(enrollReqs.slice(off, off + 25));
  }

  const startReqs = tokens.map((t) => ['POST', `${BASE_URL}/api/v1/student/exams/${examId}/attempts`, null, authHeaders(t)]);
  const attempts = [];
  for (let off = 0; off < VUS; off += 25) {
    const resps = http.batch(startReqs.slice(off, off + 25));
    for (let j = 0; j < resps.length; j++) {
      const id = resps[j].json()?.data?.attemptId || resps[j].json()?.data?.id || '';
      attempts.push({ token: tokens[off + j], attemptId: id });
    }
  }
  return { attempts };
}

export default function (data) {
  const item = data.attempts[__VU - 1];
  if (!item || !item.attemptId) return;
  const submitRes = http.post(
    `${BASE_URL}/api/v1/student/attempts/${item.attemptId}/submit`,
    null,
    authHeaders(item.token)
  );
  check(submitRes, { 'submit attempt 200': (r) => r.status === 200 });
}
