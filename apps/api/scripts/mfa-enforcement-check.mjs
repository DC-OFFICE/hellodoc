/**
 * MFA enforcement proof: temporary API with MFA_REQUIRED=true on MFA_CHECK_PORT.
 * Synthetic accounts only. No MFA bypass is introduced.
 *
 *   npm run build -w @hellodoc/api
 *   node --env-file=.env scripts/mfa-enforcement-check.mjs
 */
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import pg from 'pg';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MFA_CHECK_PORT || 4010);
const apiBase = `http://127.0.0.1:${port}/api`;
const password = 'MfaCheck!Pass9';
const runId = randomBytes(3).toString('hex');
const results = [];

const pass = (name, detail = '') => {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail) => {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name} — ${detail}`);
};

function totpCode(secretBase32, nowMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secretBase32.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = BigInt(Math.floor(nowMs / 30_000));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getCsrf(jar) {
  const res = await fetch(`${apiBase}/csrf`, { headers: jar.cookie ? { cookie: jar.cookie } : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const part = c.split(';')[0];
    if (!part) continue;
    const key = part.split('=')[0];
    jar.cookie = jar.cookie.includes(`${key}=`)
      ? jar.cookie
          .split('; ')
          .filter((x) => !x.startsWith(`${key}=`))
          .concat(part)
          .join('; ')
      : jar.cookie
        ? `${jar.cookie}; ${part}`
        : part;
  }
  jar.csrf = (await res.json()).csrfToken;
}

async function api(path, { method = 'GET', json, jar }) {
  const headers = {};
  if (jar.cookie) headers.cookie = jar.cookie;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!jar.csrf) await getCsrf(jar);
    headers['x-csrf-token'] = jar.csrf;
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const part = c.split(';')[0];
    if (!part) continue;
    const key = part.split('=')[0];
    jar.cookie = jar.cookie.includes(`${key}=`)
      ? jar.cookie
          .split('; ')
          .filter((x) => !x.startsWith(`${key}=`))
          .concat(part)
          .join('; ')
      : jar.cookie
        ? `${jar.cookie}; ${part}`
        : part;
  }
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, body: ct.includes('application/json') ? await res.json() : null };
}

const distMain = join(apiRoot, 'dist', 'main.js');
if (!existsSync(distMain)) {
  console.error('BLOCKED: build the API first (npm run build -w @hellodoc/api)');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('BLOCKED: DATABASE_URL is required');
  process.exit(1);
}

const pgUrl = new URL(process.env.DATABASE_URL);
pgUrl.searchParams.delete('schema');
const db = new pg.Client({ connectionString: pgUrl.toString() });

const adminEmail = `mfa_platform_${runId}@example.com`;
const managerEmail = `mfa_mgr_${runId}@example.com`;
const clinicName = `HelloDoc MFA Check ${runId}`;
const mobile = `077${String(parseInt(runId, 16) % 10_000_000).padStart(7, '0')}`;

const child = spawn(process.execPath, [distMain], {
  cwd: apiRoot,
  env: {
    ...process.env,
    PORT: String(port),
    MFA_REQUIRED: 'true',
    NODE_ENV: 'development',
    SMS_DISPATCH_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let stderr = '';
child.stderr.on('data', (c) => {
  stderr += c.toString();
});

try {
  await db.connect();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const adminId = randomUUID();
  await db.query(
    `INSERT INTO platform."PlatformUser"
      (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4, $5, true, NOW(), NOW())`,
    [adminId, `MFA Platform ${runId}`, adminEmail, adminEmail.toLowerCase(), passwordHash],
  );
  await db.query(
    `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt")
     VALUES ($1::uuid, $2::uuid, true, NOW())`,
    [randomUUID(), adminId],
  );
  pass('seed_platform_admin', adminEmail);

  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early: ${child.exitCode}\n${stderr.slice(-500)}`);
    try {
      if ((await fetch(`${apiBase}/health/live`)).ok) break;
    } catch {
      // retry
    }
    await wait(1000);
    if (i === 59) throw new Error('API health timeout');
  }
  pass('api_started_mfa_required', `port=${port}`);

  // Platform admin: session without MFA cannot list registrations.
  let adminJar = { cookie: '', csrf: '' };
  await getCsrf(adminJar);
  let login = await api('/platform-auth/login', {
    method: 'POST',
    jar: adminJar,
    json: { email: adminEmail, password },
  });
  if (login.status !== 200 || !login.body?.user) {
    fail('platform_login_pre_mfa', JSON.stringify(login.body));
    throw new Error('platform login failed');
  }
  pass('platform_login_pre_mfa', 'session issued for enrollment');

  let blocked = await api('/platform/registrations', { jar: adminJar });
  if (blocked.status === 403 && blocked.body?.code === 'MFA_ENROLLMENT_REQUIRED') {
    pass('platform_api_blocked_pre_mfa', 'MFA_ENROLLMENT_REQUIRED');
  } else {
    fail('platform_api_blocked_pre_mfa', `status=${blocked.status} body=${JSON.stringify(blocked.body)}`);
  }

  const enroll = await api('/platform-auth/mfa/enroll', { method: 'POST', jar: adminJar, json: {} });
  if (![200, 201].includes(enroll.status) || !enroll.body?.secret) {
    fail('platform_mfa_enroll', JSON.stringify(enroll.body));
    throw new Error('platform enroll failed');
  }
  const platformSecret = enroll.body.secret;
  const confirm = await api('/platform-auth/mfa/confirm', {
    method: 'POST',
    jar: adminJar,
    json: { code: totpCode(platformSecret) },
  });
  if (![200, 201].includes(confirm.status) || !confirm.body?.enabled || !confirm.body?.recoveryCodes?.length) {
    fail(
      'platform_mfa_confirm',
      `status=${confirm.status} enabled=${Boolean(confirm.body?.enabled)} codeCount=${confirm.body?.recoveryCodes?.length ?? 0}`,
    );
    throw new Error('platform confirm failed');
  }
  pass('platform_mfa_enroll_confirm', `codes=${confirm.body.recoveryCodes.length}`);

  // Re-login requires challenge
  adminJar = { cookie: '', csrf: '' };
  await getCsrf(adminJar);
  login = await api('/platform-auth/login', {
    method: 'POST',
    jar: adminJar,
    json: { email: adminEmail, password },
  });
  if (!login.body?.mfaRequired || !login.body?.mfaToken) {
    fail('platform_challenge_after_enable', JSON.stringify(login.body));
    throw new Error('expected MFA challenge');
  }
  pass('platform_challenge_after_enable', 'mfaToken issued');

  const bad = await api('/platform-auth/mfa/verify', {
    method: 'POST',
    jar: adminJar,
    json: { mfaToken: login.body.mfaToken, code: '000000' },
  });
  if ([401, 403].includes(bad.status)) pass('platform_rejects_bad_totp', `status=${bad.status}`);
  else fail('platform_rejects_bad_totp', JSON.stringify(bad.body));

  // Avoid step replay from confirm: wait until next 30s window if needed
  let verified = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = totpCode(platformSecret);
    verified = await api('/platform-auth/mfa/verify', {
      method: 'POST',
      jar: adminJar,
      json: { mfaToken: login.body.mfaToken, code },
    });
    if (verified.status === 200) break;
    await wait(15_000);
  }
  if (verified?.status === 200) pass('platform_accepts_totp', 'session established');
  else fail('platform_accepts_totp', JSON.stringify(verified?.body));

  // Register + approve clinic
  const publicJar = { cookie: '', csrf: '' };
  await getCsrf(publicJar);
  const reg = await api('/clinic-registrations', {
    method: 'POST',
    jar: publicJar,
    json: {
      clinicName,
      ownerName: 'MFA Owner',
      email: managerEmail,
      mobile,
      address: 'Colombo',
      password,
      confirmPassword: password,
      acceptTerms: true,
    },
  });
  if (![200, 201].includes(reg.status)) {
    fail('register_clinic', JSON.stringify(reg.body));
    throw new Error('register failed');
  }
  pass('register_clinic', clinicName);

  const pending = await db.query(
    `SELECT id FROM platform."ClinicRegistration" WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [managerEmail],
  );
  const registrationId = pending.rows[0]?.id;
  const approve = await api(`/platform/registrations/${registrationId}/approve`, {
    method: 'POST',
    jar: adminJar,
    json: {},
  });
  if (![200, 201].includes(approve.status)) {
    fail('approve_clinic', `status=${approve.status} body=${JSON.stringify(approve.body)}`);
    throw new Error('approve failed');
  }
  pass('approve_clinic', registrationId);

  // Manager pre-MFA: protected clinic API denied; enroll path allowed
  let mgrJar = { cookie: '', csrf: '' };
  await getCsrf(mgrJar);
  let mgrLogin = await api('/clinic-auth/login', {
    method: 'POST',
    jar: mgrJar,
    json: { email: managerEmail, password },
  });
  if (mgrLogin.status !== 200 || !mgrLogin.body?.user) {
    fail('manager_login_pre_mfa', JSON.stringify(mgrLogin.body));
    throw new Error('manager login failed');
  }
  pass('manager_login_pre_mfa', 'session for enrollment');

  blocked = await api('/clinic/patients?limit=5', { jar: mgrJar });
  if (blocked.status === 403 && blocked.body?.code === 'MFA_ENROLLMENT_REQUIRED') {
    pass('manager_patients_blocked_pre_mfa', 'MFA_ENROLLMENT_REQUIRED');
  } else {
    fail('manager_patients_blocked_pre_mfa', `status=${blocked.status} body=${JSON.stringify(blocked.body)}`);
  }

  const meOk = await api('/clinic-auth/me', { jar: mgrJar });
  if (meOk.status === 200) pass('manager_me_allowed_pre_mfa', 'enrollment helper route');
  else fail('manager_me_allowed_pre_mfa', JSON.stringify(meOk.body));

  const mgrEnroll = await api('/clinic-auth/mfa/enroll', { method: 'POST', jar: mgrJar, json: {} });
  if (![200, 201].includes(mgrEnroll.status) || !mgrEnroll.body?.secret) {
    fail('manager_mfa_enroll', JSON.stringify(mgrEnroll.body));
    throw new Error('manager enroll failed');
  }
  const managerSecret = mgrEnroll.body.secret;
  const mgrConfirm = await api('/clinic-auth/mfa/confirm', {
    method: 'POST',
    jar: mgrJar,
    json: { code: totpCode(managerSecret) },
  });
  if (![200, 201].includes(mgrConfirm.status) || !mgrConfirm.body?.enabled || !mgrConfirm.body?.recoveryCodes?.length) {
    fail(
      'manager_mfa_confirm',
      `status=${mgrConfirm.status} enabled=${Boolean(mgrConfirm.body?.enabled)} codeCount=${mgrConfirm.body?.recoveryCodes?.length ?? 0}`,
    );
    throw new Error('manager confirm failed');
  }
  pass('manager_mfa_enroll_confirm', `codes=${mgrConfirm.body.recoveryCodes.length}`);
  const recoveryCodes = mgrConfirm.body.recoveryCodes;

  const stale = await api('/clinic/patients?limit=5', { jar: mgrJar });
  if ([401, 403].includes(stale.status)) pass('manager_session_revoked_after_confirm', `status=${stale.status}`);
  else fail('manager_session_revoked_after_confirm', `status=${stale.status}`);

  mgrJar = { cookie: '', csrf: '' };
  await getCsrf(mgrJar);
  mgrLogin = await api('/clinic-auth/login', {
    method: 'POST',
    jar: mgrJar,
    json: { email: managerEmail, password },
  });
  if (!mgrLogin.body?.mfaRequired || !mgrLogin.body?.mfaToken) {
    fail('manager_challenge_required', JSON.stringify(mgrLogin.body));
    throw new Error('manager challenge missing');
  }
  pass('manager_challenge_required', 'mfaToken issued');

  const mgrBad = await api('/clinic-auth/mfa/verify', {
    method: 'POST',
    jar: mgrJar,
    json: { mfaToken: mgrLogin.body.mfaToken, code: '111111' },
  });
  if ([401, 403].includes(mgrBad.status)) pass('manager_rejects_bad_totp', `status=${mgrBad.status}`);
  else fail('manager_rejects_bad_totp', JSON.stringify(mgrBad.body));

  verified = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    verified = await api('/clinic-auth/mfa/verify', {
      method: 'POST',
      jar: mgrJar,
      json: { mfaToken: mgrLogin.body.mfaToken, code: totpCode(managerSecret) },
    });
    if (verified.status === 200) break;
    await wait(15_000);
  }
  if (verified?.status === 200) pass('manager_accepts_totp', 'session established');
  else fail('manager_accepts_totp', JSON.stringify(verified?.body));

  const patients = await api('/clinic/patients?limit=5', { jar: mgrJar });
  if (patients.status === 200) pass('manager_patients_allowed_post_mfa', 'status=200');
  else fail('manager_patients_allowed_post_mfa', `status=${patients.status} body=${JSON.stringify(patients.body)}`);

  // Direct API without cookie still unauthorized
  const anon = await fetch(`${apiBase}/clinic/patients?limit=5`);
  if (anon.status === 401) pass('anonymous_patients_unauthorized', '401');
  else fail('anonymous_patients_unauthorized', `status=${anon.status}`);

  // Disable with recovery code
  const disable = await api('/clinic-auth/mfa/disable', {
    method: 'POST',
    jar: mgrJar,
    json: { password, code: recoveryCodes[0] },
  });
  if ([200, 201].includes(disable.status) && disable.body?.disabled) {
    pass('manager_disable_with_recovery', `status=${disable.status}`);
  } else {
    fail('manager_disable_with_recovery', `status=${disable.status} disabled=${Boolean(disable.body?.disabled)}`);
  }

  // After disable, login should not challenge; with MFA_REQUIRED protected APIs require re-enroll
  mgrJar = { cookie: '', csrf: '' };
  await getCsrf(mgrJar);
  mgrLogin = await api('/clinic-auth/login', {
    method: 'POST',
    jar: mgrJar,
    json: { email: managerEmail, password },
  });
  if (mgrLogin.body?.mfaRequired) fail('manager_no_challenge_after_disable', 'unexpected challenge');
  else pass('manager_no_challenge_after_disable', 'password login only');
  blocked = await api('/clinic/patients?limit=5', { jar: mgrJar });
  if (blocked.status === 403 && blocked.body?.code === 'MFA_ENROLLMENT_REQUIRED') {
    pass('manager_reenrollment_required_when_mfa_mandatory', 'MFA_ENROLLMENT_REQUIRED');
  } else {
    fail('manager_reenrollment_required_when_mfa_mandatory', `status=${blocked.status} body=${JSON.stringify(blocked.body)}`);
  }
} catch (err) {
  fail('harness', err instanceof Error ? err.message : String(err));
  if (stderr.trim()) console.error(stderr.split(/\r?\n/).slice(-30).join('\n'));
} finally {
  await db
    .query(`UPDATE platform."PlatformUser" SET active = false, "updatedAt" = NOW() WHERE email = $1`, [adminEmail])
    .catch(() => undefined);
  await db.end().catch(() => undefined);
  child.kill();
  await wait(1500);
  if (child.exitCode === null && child.pid) {
    try {
      process.kill(child.pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  JSON.stringify(
    {
      mode: 'MFA_REQUIRED=true',
      port,
      runId,
      clinicName,
      passed: results.filter((r) => r.ok).length,
      failed,
      results,
      note: 'Doctor/cashier/receptionist share the same AuthGuard MFA_ENROLLMENT_REQUIRED path; this harness proves platform admin + clinic manager end-to-end. Dedicated role MFA browser UAT remains separate.',
    },
    null,
    2,
  ),
);
process.exit(failed ? 1 : 0);
