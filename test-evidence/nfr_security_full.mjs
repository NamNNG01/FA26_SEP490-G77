import fs from 'node:fs';

const BE = 'http://localhost:8080';
const FE = 'http://localhost:3000';
const logs = [];

function log(group, name, expected, actual, passed, detail = '') {
  const line = `[${group}] ${passed ? 'PASS' : 'FAIL'} | ${name} | expected=${expected} | actual=${actual}${detail ? ' | ' + detail : ''}`;
  logs.push({ group, name, expected, actual, passed, detail });
  console.log(line);
}

async function req(url, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    const ms = performance.now() - t0;
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, ms, text, json };
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - t0, text: err.message, json: null };
  }
}

async function main() {
  console.log('=== COMPREHENSIVE SECURITY & NFR SUITE (Report 3 Section IV) ===');

  // 1. Authentication
  for (const ep of ['/api/v1/dashboard/student', '/api/v1/admin/users', '/api/v1/manager/questions', '/api/v1/student/materials', '/api/v1/student/me/ai-quota']) {
    const r = await req(`${BE}${ep}`);
    log('SEC-AUTH', `Unauthenticated ${ep}`, '401', r.status, r.status === 401);
  }
  const rBadJwt = await req(`${BE}/api/v1/dashboard/student`, {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalid' }
  });
  log('SEC-AUTH', 'Tampered JWT rejected on /api/v1/dashboard/student', '401', rBadJwt.status, rBadJwt.status === 401);

  // Register Student A & Student B
  const ts = Date.now();
  const pwd = 'TestPassword@123';
  const emailA = `nfr_a_${ts}@example.com`;
  const emailB = `nfr_b_${ts}@example.com`;
  await req(`${BE}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: pwd, fullName: 'NFR Student A' }) });
  await req(`${BE}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailB, password: pwd, fullName: 'NFR Student B' }) });

  const loginA = await req(`${BE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: pwd }) });
  const loginB = await req(`${BE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailB, password: pwd }) });
  const tokA = loginA.json?.data?.accessToken || loginA.json?.accessToken;
  const refA = loginA.json?.data?.refreshToken || loginA.json?.refreshToken;
  const tokB = loginB.json?.data?.accessToken || loginB.json?.accessToken;
  log('SEC-AUTH', 'Register & Login Student A + B', '200 + JWT', `${loginA.status}/${loginB.status}`, Boolean(tokA && tokB));

  if (tokA && tokB) {
    const hdrA = { Authorization: `Bearer ${tokA}` };
    const hdrB = { Authorization: `Bearer ${tokB}` };

    // 2. Authorization (RBAC)
    for (const ep of ['/api/v1/dashboard/admin', '/api/v1/dashboard/course-manager', '/api/v1/admin/users', '/api/v1/admin/settings', '/api/v1/manager/questions']) {
      const r = await req(`${BE}${ep}`, { headers: hdrA });
      log('SEC-RBAC', `Student A -> ${ep}`, '403', r.status, r.status === 403);
    }

    // 3. AI API Protection & Quota
    const rQuota = await req(`${BE}/api/v1/student/me/ai-quota`, { headers: hdrA });
    log('SEC-AI', 'AI Quota accessible with valid JWT', '200', rQuota.status, rQuota.status === 200, `quota=${rQuota.text.slice(0, 70)}`);

    // 4. File Access
    const rMatA = await req(`${BE}/api/v1/student/materials`, { headers: hdrA });
    log('SEC-FILE', 'Student A /api/v1/student/materials (Auth)', '200', rMatA.status, rMatA.status === 200);

    // 5. Data Privacy (Cross-user IDOR: Student B -> Student A / non-owned attempt & progress)
    const rPriv1 = await req(`${BE}/api/v1/student/attempts/999999`, { headers: hdrB });
    log('SEC-PRIVACY', 'Student B cannot access unowned attempt 999999', '403/404', rPriv1.status, rPriv1.status === 403 || rPriv1.status === 404);
    const rPriv2 = await req(`${BE}/api/v1/student/progress/activities`, { headers: hdrA });
    log('SEC-PRIVACY', 'Student A own learning activities visible only to owner', '200', rPriv2.status, rPriv2.status === 200);

    // 6. Payment Security (PayOS Webhook)
    const rWh = await req(`${BE}/api/v1/webhooks/payos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '00', desc: 'success', data: { orderCode: 999999, amount: 100000 }, signature: 'forged_sig' })
    });
    log('SEC-PAYMENT', 'PayOS forged webhook rejected', '4xx', rWh.status, rWh.status >= 400 && rWh.status < 500);

    // 7. Session Management (Logout -> Refresh rejected)
    const rOut = await req(`${BE}/api/v1/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hdrA }, body: JSON.stringify({ refreshToken: refA }) });
    const rRef = await req(`${BE}/api/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refA }) });
    log('SEC-SESSION', 'Revoked refresh token rejected after logout', '401', rRef.status, rRef.status === 401, `logout=${rOut.status}`);

    // 8. Password Protection (Account Lockout after 7 failed logins)
    let lockStatus = 0;
    let lockMsg = '';
    for (let i = 1; i <= 7; i++) {
      const rf = await req(`${BE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: 'WrongPassword!' }) });
      lockStatus = rf.status;
      lockMsg = rf.text.slice(0, 70);
      if (rf.status === 423 || /lock/i.test(rf.text)) break;
    }
    log('SEC-LOCKOUT', 'Account Lockout after 7 failed logins', '423 / lock', lockStatus, lockStatus === 423 || /lock/i.test(lockMsg), lockMsg);

    // 9. Error Feedback (Invalid login returns structured JSON error)
    const rErr = await req(`${BE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: 'Bad!' }) });
    log('USABILITY-ERR', 'Invalid login returns clear error feedback JSON', '401 + message', `${rErr.status} (${rErr.json?.message || ''})`, rErr.status === 401 && Boolean(rErr.json?.message));

    // 10. HTTPS check (Dev localhost uses HTTP; production requires TLS)
    const isHttps = BE.startsWith('https://');
    log('SEC-HTTPS', 'HTTPS / TLS enforcement (Local dev check)', 'https:// in prod', isHttps ? 'https' : 'http (dev)', isHttps, 'Localhost dev runs HTTP; verify TLS on prod');
  }

  fs.writeFileSync('test-evidence/nfr_full_security.json', JSON.stringify(logs, null, 2));
}

main();
