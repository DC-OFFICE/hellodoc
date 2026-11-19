/**
 * Creates disposable HelloDoc E2E clinics and staff through the live API.
 * Never touches clinics that are not tagged with the E2E marker.
 *
 * Usage:
 *   node --env-file=../../api/.env e2e/scripts/seed-e2e.mjs
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiBase = process.env.API_BASE_URL ?? process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:4000/api';
const databaseUrl = process.env.DATABASE_URL;
const webOrigin = process.env.PLAYWRIGHT_BASE_URL ?? process.env.PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
const marker = 'HelloDoc E2E';
const runId = randomBytes(3).toString('hex');
const password = `E2ePass1!${runId}`;

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

function clinicNowParts() {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    localDate,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function formatHm(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function getCsrf(jar) {
  const res = await fetch(`${apiBase}/csrf`, { headers: jar.cookie ? { cookie: jar.cookie } : undefined });
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const part = cookie.split(';')[0];
    if (part) jar.cookie = jar.cookie ? `${jar.cookie}; ${part}` : part;
  }
  jar.csrf = (await res.json()).csrfToken;
}

async function api(path, { method = 'GET', json, jar }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    for (const cookie of res.headers.getSetCookie?.() ?? []) {
      const part = cookie.split(';')[0];
      if (!part) continue;
      const key = part.split('=')[0];
      const parts = (jar.cookie || '').split('; ').filter((item) => item && !item.startsWith(`${key}=`));
      parts.push(part);
      jar.cookie = parts.join('; ');
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : contentType.includes('text/html')
        ? await res.text()
        : null;
    if (res.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      continue;
    }
    return { status: res.status, body };
  }
  return { status: 429, body: null };
}

function assertOk(result, label) {
  if (result.status >= 300) {
    throw new Error(`${label} failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function ensureAdmin(pool) {
  const email = `e2e_admin_${runId}@dartcodes.test`;
  const id = randomUUID();
  await pool.query(
    `INSERT INTO platform."PlatformUser"
      (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
    [id, 'E2E Admin', email, email, await argon2.hash(password, { type: argon2.argon2id })],
  );
  await pool.query(
    `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt") VALUES ($1,$2,true,NOW())`,
    [randomUUID(), id],
  );
  return { email, password };
}

async function ensureCatalogs(pool) {
  let spec = await pool.query(`SELECT id::text FROM platform."Specialization" WHERE active = true LIMIT 1`);
  let qual = await pool.query(`SELECT id::text FROM platform."Qualification" WHERE active = true LIMIT 1`);
  if (!spec.rows[0]) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO platform."Specialization" (id, name, "nameNormalized", active, "createdAt", "updatedAt")
       VALUES ($1,'General Practice','general practice',true,NOW(),NOW())`,
      [id],
    );
    spec = { rows: [{ id }] };
  }
  if (!qual.rows[0]) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO platform."Qualification" (id, name, "nameNormalized", active, "createdAt", "updatedAt")
       VALUES ($1,'MBBS','mbbs',true,NOW(),NOW())`,
      [id],
    );
    qual = { rows: [{ id }] };
  }
  return { specializationId: spec.rows[0].id, qualificationId: qual.rows[0].id };
}

async function registerAndApprove(adminJar, clinic) {
  const publicJar = { cookie: '', csrf: '' };
  await getCsrf(publicJar);
  assertOk(
    await api('/clinic-registrations', {
      method: 'POST',
      jar: publicJar,
      json: {
        clinicName: clinic.clinicName,
        ownerName: clinic.ownerName,
        email: clinic.email,
        mobile: clinic.mobile,
        address: clinic.address,
        password: clinic.password,
        confirmPassword: clinic.password,
        acceptTerms: true,
      },
    }),
    `register ${clinic.clinicName}`,
  );
  const regs = assertOk(await api('/platform/registrations', { jar: adminJar }), 'list registrations');
  const pending = regs.find((row) => row.status === 'PENDING_APPROVAL' && row.clinicName === clinic.clinicName);
  if (!pending) throw new Error(`Pending registration missing for ${clinic.clinicName}`);
  assertOk(await api(`/platform/registrations/${pending.id}/approve`, { method: 'POST', jar: adminJar, json: {} }), `approve ${clinic.clinicName}`);
}

async function loginClinic(email, pass) {
  const jar = { cookie: '', csrf: '' };
  await getCsrf(jar);
  const body = assertOk(await api('/clinic-auth/login', { method: 'POST', jar, json: { email, password: pass } }), `login ${email}`);
  if (body.mfaRequired) {
    throw new Error(`MFA is required for ${email}. Local E2E expects MFA_REQUIRED=false; do not bypass MFA.`);
  }
  return jar;
}

async function provisionClinic(adminJar, catalogs, label, mobileBase) {
  const clinicName = `${marker} Clinic ${label} ${runId}`;
  const managerEmail = `e2e_${label.toLowerCase()}_mgr_${runId}@example.com`;
  const manager = {
    clinicName,
    ownerName: `Owner ${label}`,
    email: managerEmail,
    mobile: mobileBase,
    address: 'Colombo',
    password,
  };
  await registerAndApprove(adminJar, manager);
  const managerJar = await loginClinic(managerEmail, password);

  const doctorName = `Dr E2E ${label} ${runId}`;
  const doctorEmail = `e2e_${label.toLowerCase()}_doc_${runId}@example.com`;
  const doctor = assertOk(
    await api('/clinic/doctors', {
      method: 'POST',
      jar: managerJar,
      json: {
        fullName: doctorName,
        specializationId: catalogs.specializationId,
        qualificationId: catalogs.qualificationId,
        confirmDuplicate: true,
      },
    }),
    'create doctor',
  );
  const invite = assertOk(
    await api(`/clinic/doctors/${doctor.id}/invitations`, { method: 'POST', jar: managerJar, json: { email: doctorEmail } }),
    'invite doctor',
  );
  const doctorToken = new URL(invite.acceptUrl).searchParams.get('token');
  const publicJar = { cookie: '', csrf: '' };
  await getCsrf(publicJar);
  assertOk(
    await api('/doctor/invitations/accept', {
      method: 'POST',
      jar: publicJar,
      json: { token: doctorToken, name: doctorName, password },
    }),
    'accept doctor',
  );
  assertOk(
    await api(`/clinic/doctors/${doctor.id}/credential-review`, {
      method: 'POST',
      jar: managerJar,
      json: { status: 'VERIFIED' },
    }),
    'verify doctor',
  );

  const cashierEmail = `e2e_${label.toLowerCase()}_cash_${runId}@example.com`;
  const cashierInvite = assertOk(
    await api('/clinic/staff/cashier-invitations', { method: 'POST', jar: managerJar, json: { email: cashierEmail } }),
    'invite cashier',
  );
  const cashierToken = new URL(cashierInvite.acceptUrl).searchParams.get('token');
  assertOk(
    await api('/staff/invitations/accept', {
      method: 'POST',
      jar: publicJar,
      json: { token: cashierToken, name: `Cashier ${label}`, password },
    }),
    'accept cashier',
  );

  const receptionistEmail = `e2e_${label.toLowerCase()}_rec_${runId}@example.com`;
  const receptionistInvite = assertOk(
    await api('/clinic/staff/receptionist-invitations', {
      method: 'POST',
      jar: managerJar,
      json: { email: receptionistEmail },
    }),
    'invite receptionist',
  );
  const receptionistToken = new URL(receptionistInvite.acceptUrl).searchParams.get('token');
  assertOk(
    await api('/staff/invitations/accept', {
      method: 'POST',
      jar: publicJar,
      json: { token: receptionistToken, name: `Reception ${label}`, password },
    }),
    'accept receptionist',
  );

  const now = clinicNowParts();
  const startMinutes = now.hour * 60 + now.minute + 3;
  const doctorEndMinutes = Math.min(startMinutes + 90, 23 * 60 + 50);
  const bookingStartMinutes = doctorEndMinutes;
  const bookingEndMinutes = Math.min(bookingStartMinutes + 120, 23 * 60 + 59);
  if (bookingEndMinutes - bookingStartMinutes < 30) {
    throw new Error('Not enough remaining Asia/Colombo time today to create two future E2E sessions');
  }
  const doctorSession = assertOk(
    await api('/clinic/sessions', {
      method: 'POST',
      jar: managerJar,
      json: {
        doctorId: doctor.id,
        localDate: now.localDate,
        startTime: formatHm(startMinutes),
        endTime: formatHm(doctorEndMinutes),
        capacity: 20,
        expectedDurationMinutes: 10,
      },
    }),
    'create doctor session',
  );
  const bookingSession = assertOk(
    await api('/clinic/sessions', {
      method: 'POST',
      jar: managerJar,
      json: {
        doctorId: doctor.id,
        localDate: now.localDate,
        startTime: formatHm(bookingStartMinutes),
        endTime: formatHm(bookingEndMinutes),
        capacity: 20,
        expectedDurationMinutes: 10,
      },
    }),
    'create booking session',
  );

  const service = assertOk(
    await api('/clinic/billing/services', {
      method: 'POST',
      jar: managerJar,
      json: {
        code: `E2E${label}${runId.slice(0, 4)}`.toUpperCase().slice(0, 20),
        name: `E2E Consultation ${runId}`,
        price: '2000.00',
        taxClassification: 'EXEMPT',
      },
    }),
    'create service',
  );

  const seedPatient = assertOk(
    await api('/clinic/patients', {
      method: 'POST',
      jar: managerJar,
      json: {
        fullName: `E2E Seed Patient ${label} ${runId}`,
        sex: 'UNKNOWN',
        contacts: [{ contactType: 'MOBILE', value: `0771${mobileBase.slice(-6)}`, isPrimary: true }],
        confirmSharedPhone: true,
      },
    }),
    'seed patient',
  );

  const doctorAppt = assertOk(
    await api('/clinic/appointments', {
      method: 'POST',
      jar: managerJar,
      json: {
        patientId: seedPatient.id,
        sessionId: doctorSession.id,
        bookingSource: 'WALK_IN',
        idempotencyKey: `e2e-doc-${label}-${runId}`,
      },
    }),
    'doctor fixture appointment',
  );

  assertOk(
    await api(`/clinic/sessions/${doctorSession.id}/open`, { method: 'POST', jar: managerJar, json: {} }),
    'open doctor session',
  );
  assertOk(
    await api(`/clinic/appointments/${doctorAppt.id}/check-in`, { method: 'POST', jar: managerJar, json: {} }),
    'check in doctor fixture',
  );
  const called = assertOk(
    await api(`/clinic/sessions/${doctorSession.id}/queue/call-next`, { method: 'POST', jar: managerJar, json: {} }),
    'call next for doctor fixture',
  );
  const entryId = called.called?.[0]?.id ?? called.currentCalled?.id;
  if (!entryId) throw new Error('Doctor fixture queue entry missing after Call Next');
  assertOk(
    await api(`/clinic/queue/${entryId}/start-turn`, { method: 'POST', jar: managerJar, json: {} }),
    'start doctor fixture turn',
  );

  const tracking = assertOk(
    await api(`/clinic/appointments/${doctorAppt.id}/tracking-link`, { method: 'POST', jar: managerJar, json: {} }),
    'tracking link',
  );
  const trackingUrl = tracking.url;
  const trackingPath = trackingUrl.startsWith('http')
    ? new URL(trackingUrl).pathname
    : trackingUrl;

  return {
    clinicName,
    bookingSessionId: bookingSession.id,
    doctorSessionId: doctorSession.id,
    doctorId: doctor.id,
    doctorName,
    serviceId: service.id,
    seedPatientId: seedPatient.id,
    seedPatientNumber: seedPatient.patientNumber,
    seedAppointmentId: doctorAppt.id,
    trackingPath,
    manager: { email: managerEmail, password, role: 'clinic_manager' },
    doctor: { email: doctorEmail, password, role: 'clinic_doctor' },
    cashier: { email: cashierEmail, password, role: 'clinic_cashier' },
    receptionist: { email: receptionistEmail, password, role: 'clinic_receptionist' },
  };
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
try {
  const health = await fetch(`${apiBase}/health`);
  if (!health.ok) throw new Error(`API health failed: ${health.status}`);

  const catalogs = await ensureCatalogs(pool);
  const admin = await ensureAdmin(pool);
  const adminJar = { cookie: '', csrf: '' };
  await getCsrf(adminJar);
  assertOk(await api('/platform-auth/login', { method: 'POST', jar: adminJar, json: { email: admin.email, password: admin.password } }), 'admin login');

  const clinicA = await provisionClinic(adminJar, catalogs, 'A', '0774100001');
  const clinicB = await provisionClinic(adminJar, catalogs, 'B', '0774100002');

  const outDir = join(__dirname, '..', '.auth');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    runId,
    marker,
    seededAt: new Date().toISOString(),
    mfaRequired: process.env.MFA_REQUIRED === 'true',
    webOrigin,
    apiBase,
    clinicA,
    clinicB,
  };
  writeFileSync(join(outDir, 'credentials.json'), JSON.stringify(payload, null, 2));
  writeFileSync(
    join(outDir, 'README.txt'),
    'Generated E2E credentials. Do not commit. Passwords are synthetic and disposable.\n',
  );
  console.log(`E2E_SEED_OK runId=${runId} clinicA=${clinicA.clinicName}`);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await pool.end();
}
