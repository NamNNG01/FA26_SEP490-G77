import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, authHeaders } from './common.js';

// TC-PERF-013: Exam autosave burst (100 concurrent students with distinct attempts)
// Target: <= 1 s at p95, error rate < 1%
const VUS = 100;

export const options = {
  vus: VUS,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<=1000'],
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

  const regReqs = [];
  const loginReqs = [];
  for (let i = 0; i < VUS; i++) {
    const email = `k6_as_${ts}_${i}@example.test`;
    regReqs.push(['POST', `${BASE_URL}/api/v1/auth/register`, JSON.stringify({ email, password: pw, fullName: `K6 AS ${i}` }), jsonHdr]);
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
      const d = resps[j].json()?.data || {};
      attempts.push({
        token: tokens[off + j],
        attemptId: d.attemptId || d.id || '',
        questionId: d.questions?.[0]?.questionId || 2445,
      });
    }
  }
  return { attempts };
}

export default function (data) {
  const item = data.attempts[__VU - 1];
  if (!item || !item.attemptId) return;
  const payload = JSON.stringify({
    answers: [
      { questionId: item.questionId, seq: __ITER + 1, response: {} },
    ],
  });
  const res = http.put(
    `${BASE_URL}/api/v1/student/attempts/${item.attemptId}/answers`,
    payload,
    authHeaders(item.token)
  );
  check(res, { 'autosave 200': (r) => r.status === 200 });
  sleep(0.5);
}
