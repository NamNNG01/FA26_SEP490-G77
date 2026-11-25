import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, authHeaders } from './common.js';

// TC-PERF-014: Contest synchronized start (100 concurrent participants)
// Target: <= 3 s at p95, error rate < 1%
const VUS = 100;

export const options = {
  scenarios: {
    sync_start: {
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
  const contestId = __ENV.CONTEST_ID || '14';
  const ts = Date.now();
  const pw = 'Password123!';
  const jsonHdr = { headers: { 'Content-Type': 'application/json' } };

  const regReqs = [];
  const loginReqs = [];
  for (let i = 0; i < VUS; i++) {
    const email = `k6_c14_${ts}_${i}@example.test`;
    regReqs.push(['POST', `${BASE_URL}/api/v1/auth/register`, JSON.stringify({ email, password: pw, fullName: `K6 C ${i}` }), jsonHdr]);
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
  return { tokens, contestId };
}

export default function (data) {
  const tok = data.tokens[__VU - 1];
  if (!tok) return;
  const res = http.post(
    `${BASE_URL}/api/v1/student/contests/${data.contestId}/start`,
    null,
    authHeaders(tok)
  );
  check(res, { 'contest start 200/201': (r) => r.status === 200 || r.status === 201 });
}
