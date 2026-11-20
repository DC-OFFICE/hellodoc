/**
 * Two-clinic HTTP isolation covering authenticated clinic APIs and public tracking.
 * Self-provisions temporary clinics when API + DB are available.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api';

type Jar = { cookie: string; csrf: string };

async function getCsrf(jar: Jar) {
  const res = await fetch(`${apiBase}/csrf`, {
    headers: jar.cookie ? { cookie: jar.cookie } : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const part = c.split(';')[0];
    if (!part) continue;
    jar.cookie = jar.cookie ? `${jar.cookie}; ${part}` : part;
  }
  const body = (await res.json()) as { csrfToken: string };
  jar.csrf = body.csrfToken;
}

function jarMerge(jar: Jar, part: string) {
  const key = part.split('=')[0]!;
  if (jar.cookie.includes(`${key}=`)) {
    jar.cookie = jar.cookie
      .split('; ')
      .filter((x) => !x.startsWith(`${key}=`))
      .concat(part)
      .join('; ');
  } else {
    jar.cookie = jar.cookie ? `${jar.cookie}; ${part}` : part;
  }
}

async function api(
  path: string,
  options: { method?: string; json?: unknown; jar: Jar },
) {
  const method = options.method ?? 'GET';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const headers: Record<string, string> = {};
    if (options.jar.cookie) headers.cookie = options.jar.cookie;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!options.jar.csrf) await getCsrf(options.jar);
      headers['x-csrf-token'] = options.jar.csrf;
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: options.json ? JSON.stringify(options.json) : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const part = c.split(';')[0];
      if (!part) continue;
      jarMerge(options.jar, part);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await res.json() : null;
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    return { status: res.status, body };
  }
  return { status: 429, body: { message: 'throttled' } };
}

describe('two-clinic HTTP isolation', () => {
  let pool: pg.Pool | null = null;
  let dbReady = false;
  let apiReady = false;

  before(async () => {
    if (!databaseUrl) return;
    pool = new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 2000 });
    try {
      await pool.query('SELECT 1 FROM platform."Tenant" LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
    try {
      apiReady = (await fetch(`${apiBase}/health`)).ok;
    } catch {
      apiReady = false;
    }
  });

  after(async () => {
    await pool?.end();
  });

  it('isolates queue, notifications settings, and public tracking between two clinics', async (t) => {
    if (!dbReady || !apiReady || !pool) {
      t.skip('Requires migrated PostgreSQL and running API on :4000');
      return;
    }

    const suffix = randomBytes(3).toString('hex');
    const adminEmail = `iso_admin_${suffix}@dartcodes.test`;
    const adminPass = `AdminPass1!${suffix}`;
    const passwordHash = await argon2.hash(adminPass, { type: argon2.argon2id });
    const adminId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO platform."PlatformUser"
        (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      [adminId, 'Iso Admin', adminEmail, adminEmail, passwordHash],
    );
    await pool.query(
      `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt")
       VALUES ($1,$2,true,NOW())`,
      [crypto.randomUUID(), adminId],
    );

    const clinics = [
      {
        clinicName: `Iso Clinic A ${suffix}`,
        ownerName: 'Owner A',
        email: `iso_a_${suffix}@example.com`,
        mobile: '0771000001',
        address: 'Colombo 1',
        password: `ClinicPass1!${suffix}`,
      },
      {
        clinicName: `Iso Clinic B ${suffix}`,
        ownerName: 'Owner B',
        email: `iso_b_${suffix}@example.com`,
        mobile: '0771000002',
        address: 'Kandy 2',
        password: `ClinicPass2!${suffix}`,
      },
    ];

    const publicJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(publicJar);
    for (const clinic of clinics) {
      const reg = await api('/clinic-registrations', {
        method: 'POST',
        jar: publicJar,
        json: { ...clinic, confirmPassword: clinic.password, acceptTerms: true },
      });
      assert.equal(reg.status, 200);
    }

    const adminJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(adminJar);
    const login = await api('/platform-auth/login', {
      method: 'POST',
      jar: adminJar,
      json: { email: adminEmail, password: adminPass },
    });
    assert.equal(login.status, 200);

    const regs = await api('/platform/registrations?status=PENDING_APPROVAL&limit=100', { jar: adminJar });
    const pending = (regs.body as { items: Array<{ id: string; clinicName: string; status: string }> }).items.filter(
      (r) => r.status === 'PENDING_APPROVAL' && clinics.some((c) => c.clinicName === r.clinicName),
    );
    assert.equal(pending.length, 2);

    const schemaByClinic = new Map<string, string>();
    for (const reg of pending) {
      const approved = await api(`/platform/registrations/${reg.id}/approve`, {
        method: 'POST',
        jar: adminJar,
        json: {},
      });
      assert.ok(approved.status === 201 || approved.status === 200);
      schemaByClinic.set(reg.clinicName, (approved.body as { schemaName: string }).schemaName);
    }

    const jars: Jar[] = [];
    for (const clinic of clinics) {
      const jar: Jar = { cookie: '', csrf: '' };
      await getCsrf(jar);
      const clinicLogin = await api('/clinic-auth/login', {
        method: 'POST',
        jar,
        json: { email: clinic.email, password: clinic.password },
      });
      assert.equal(clinicLogin.status, 200);
      jars.push(jar);
    }

    const patchA = await api('/clinic/notification-settings', {
      method: 'PATCH',
      jar: jars[0]!,
      json: { enabled: true, approachingThreshold: 2 },
    });
    assert.equal(patchA.status, 200);
    assert.equal((patchA.body as { enabled: boolean }).enabled, true);

    const settingsB = await api('/clinic/notification-settings', { jar: jars[1]! });
    assert.equal(settingsB.status, 200);
    assert.equal((settingsB.body as { enabled: boolean }).enabled, false);

    const catalogs = await pool.query<{ kind: string; id: string }>(
      `(SELECT 'spec' AS kind, id::text FROM platform."Specialization" WHERE active = true LIMIT 1)
       UNION ALL
       (SELECT 'qual' AS kind, id::text FROM platform."Qualification" WHERE active = true LIMIT 1)`,
    );
    const specializationId = catalogs.rows.find((r) => r.kind === 'spec')?.id;
    const qualificationId = catalogs.rows.find((r) => r.kind === 'qual')?.id;
    assert.ok(specializationId && qualificationId, 'platform catalogs required');

    const doctor = await api('/clinic/doctors', {
      method: 'POST',
      jar: jars[0]!,
      json: {
        fullName: `Iso Doctor ${suffix}`,
        specializationId,
        qualificationId,
        confirmDuplicate: true,
      },
    });
    assert.ok(doctor.status === 200 || doctor.status === 201, `doctor create ${doctor.status}`);
    const doctorId = (doctor.body as { id: string }).id;

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const localDate = tomorrow.toISOString().slice(0, 10);
    const session = await api('/clinic/sessions', {
      method: 'POST',
      jar: jars[0]!,
      json: {
        doctorId,
        localDate,
        startTime: '18:00',
        endTime: '20:00',
        capacity: 20,
        expectedDurationMinutes: 10,
      },
    });
    assert.ok(session.status === 200 || session.status === 201, `session create ${session.status}`);
    const sessionId = (session.body as { id: string }).id;

    const patient = await api('/clinic/patients', {
      method: 'POST',
      jar: jars[0]!,
      json: {
        fullName: `Iso Patient ${suffix}`,
        sex: 'UNKNOWN',
        contacts: [{ contactType: 'MOBILE', value: '0771234567', isPrimary: true }],
        confirmSharedPhone: true,
      },
    });
    assert.ok(patient.status === 200 || patient.status === 201, `patient create ${patient.status}`);
    const patientId = (patient.body as { id: string }).id;

    const appointment = await api('/clinic/appointments', {
      method: 'POST',
      jar: jars[0]!,
      json: {
        patientId,
        sessionId,
        bookingSource: 'PHONE',
        idempotencyKey: `iso-${suffix}`,
      },
    });
    assert.ok(
      appointment.status === 200 || appointment.status === 201,
      `appointment create ${appointment.status} ${JSON.stringify(appointment.body)}`,
    );
    const appointmentId = (appointment.body as { id: string }).id;

    const schemaA = schemaByClinic.get(clinics[0]!.clinicName);
    assert.ok(schemaA);
    const tenantA = (
      await pool.query<{ id: string }>(
        `SELECT id::text FROM platform."Tenant" WHERE "schemaName" = $1`,
        [schemaA],
      )
    ).rows[0]?.id;

    const link = await api(`/clinic/appointments/${appointmentId}/tracking-link`, {
      method: 'POST',
      jar: jars[0]!,
    });
    assert.ok(link.status === 200 || link.status === 201, `tracking link ${link.status}`);
    const url = (link.body as { url: string }).url;
    const token = url.split('/track/')[1];
    assert.ok(token && token.length >= 32);

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const indexed = await pool.query(
      `SELECT tenant_id::text FROM platform.tracking_token_index WHERE token_hash = $1`,
      [tokenHash],
    );
    assert.equal(indexed.rowCount, 1);
    if (tenantA) assert.equal(indexed.rows[0]?.tenant_id, tenantA);

    const track = await fetch(`${apiBase}/public/track/${encodeURIComponent(token)}`);
    assert.equal(track.status, 200);
    const snap = (await track.json()) as Record<string, unknown>;
    assert.equal(typeof snap.yourQueueDisplay, 'string');
    assert.equal('patientFullName' in snap, false);
    assert.equal('phone' in snap, false);
    assert.equal('schemaHint' in snap, false);

    const stealAppt = await api(`/clinic/appointments/${appointmentId}`, { jar: jars[1]! });
    assert.ok(stealAppt.status === 404 || stealAppt.status === 403 || stealAppt.status === 400);

    const stealQueue = await api(`/clinic/sessions/${sessionId}/queue`, { jar: jars[1]! });
    assert.ok(stealQueue.status === 404 || stealQueue.status === 403 || stealQueue.status === 400);

    const stealNotif = await api(`/clinic/notifications?appointmentId=${appointmentId}`, {
      jar: jars[1]!,
    });
    assert.equal(stealNotif.status, 200);
    assert.equal((stealNotif.body as { items: unknown[] }).items.length, 0);

    const bad = await fetch(`${apiBase}/public/track/not-a-valid-token-${suffix}`);
    assert.ok(bad.status === 404 || bad.status === 400);
    const badBody = JSON.stringify(await bad.json()).toLowerCase();
    assert.equal(badBody.includes('schema'), false);

    const crossSettings = await api('/clinic/notification-settings', {
      method: 'PATCH',
      jar: jars[1]!,
      json: { enabled: true },
    });
    assert.equal(crossSettings.status, 200);
    const settingsA = await api('/clinic/notification-settings', { jar: jars[0]! });
    assert.equal((settingsA.body as { approachingThreshold: number }).approachingThreshold, 2);
  });
});
