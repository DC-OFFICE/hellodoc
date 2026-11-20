/**
 * Two-doctor clinical authorization over HTTP.
 * Skips unless the API and database are already running.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import argon2 from 'argon2';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api';
type Jar = { cookie: string; csrf: string };

async function getCsrf(jar: Jar) {
  const res = await fetch(`${apiBase}/csrf`, { headers: jar.cookie ? { cookie: jar.cookie } : undefined });
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const part = cookie.split(';')[0];
    if (part) jar.cookie = jar.cookie ? `${jar.cookie}; ${part}` : part;
  }
  jar.csrf = ((await res.json()) as { csrfToken: string }).csrfToken;
}

async function api(path: string, options: { method?: string; json?: unknown; jar: Jar }) {
  const method = options.method ?? 'GET';
  for (let attempt = 0; attempt < 4; attempt += 1) {
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
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });
    for (const cookie of res.headers.getSetCookie?.() ?? []) {
      const part = cookie.split(';')[0];
      if (!part) continue;
      const key = part.split('=')[0]!;
      const parts = (options.jar.cookie || '').split('; ').filter((item) => item && !item.startsWith(`${key}=`));
      parts.push(part);
      options.jar.cookie = parts.join('; ');
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : contentType.includes('text/html')
        ? await res.text()
        : null;
    if (res.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      continue;
    }
    return { status: res.status, body };
  }
  return { status: 429, body: null };
}

describe('clinical doctor access', () => {
  let pool: pg.Pool | null = null;
  let ready = false;

  before(async () => {
    if (!databaseUrl) return;
    pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2000 });
    try {
      await pool.query('SELECT 1');
      ready = (await fetch(`${apiBase}/health`)).ok;
    } catch {
      ready = false;
    }
  });

  after(async () => {
    await pool?.end();
  });

  it('lets only the assigned verified doctor sign, and keeps other clinics out', async (t) => {
    if (!ready || !pool) {
      t.skip('Requires migrated PostgreSQL and running API');
      return;
    }
    const suffix = randomBytes(3).toString('hex');
    const adminEmail = `clin_admin_${suffix}@dartcodes.test`;
    const adminPass = `AdminPass1!${suffix}`;
    const adminId = randomUUID();
    await pool.query(
      `INSERT INTO platform."PlatformUser" (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      [adminId, 'Clin Admin', adminEmail, adminEmail, await argon2.hash(adminPass, { type: argon2.argon2id })],
    );
    await pool.query(`INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt") VALUES ($1,$2,true,NOW())`, [
      randomUUID(),
      adminId,
    ]);
    const clinics = [
      { clinicName: `Clin A ${suffix}`, ownerName: 'Owner A', email: `clin_a_${suffix}@example.com`, mobile: '0773000001', address: 'Colombo', password: `ClinicPass1!${suffix}` },
      { clinicName: `Clin B ${suffix}`, ownerName: 'Owner B', email: `clin_b_${suffix}@example.com`, mobile: '0773000002', address: 'Galle', password: `ClinicPass1!${suffix}` },
    ];
    const publicJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(publicJar);
    for (const clinic of clinics) {
      assert.equal(
        (await api('/clinic-registrations', { method: 'POST', jar: publicJar, json: { ...clinic, confirmPassword: clinic.password, acceptTerms: true } })).status,
        200,
        clinic.clinicName,
      );
    }
    const adminJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(adminJar);
    assert.equal((await api('/platform-auth/login', { method: 'POST', jar: adminJar, json: { email: adminEmail, password: adminPass } })).status, 200);
    const regs = await api('/platform/registrations?status=PENDING_APPROVAL&limit=100', { jar: adminJar });
    for (const reg of (regs.body as { items: Array<{ id: string; clinicName: string; status: string }> }).items.filter(
      (row) => row.status === 'PENDING_APPROVAL' && clinics.some((clinic) => clinic.clinicName === row.clinicName),
    )) {
      assert.ok((await api(`/platform/registrations/${reg.id}/approve`, { method: 'POST', jar: adminJar, json: {} })).status < 300);
    }
    const managerJars: Jar[] = [];
    for (const clinic of clinics) {
      const jar: Jar = { cookie: '', csrf: '' };
      await getCsrf(jar);
      assert.equal((await api('/clinic-auth/login', { method: 'POST', jar, json: { email: clinic.email, password: clinic.password } })).status, 200);
      managerJars.push(jar);
    }
    const catalogs = await pool.query<{ kind: string; id: string }>(
      `(SELECT 'spec' AS kind, id::text FROM platform."Specialization" WHERE active = true LIMIT 1)
       UNION ALL
       (SELECT 'qual' AS kind, id::text FROM platform."Qualification" WHERE active = true LIMIT 1)`,
    );
    const specializationId = catalogs.rows.find((row) => row.kind === 'spec')?.id;
    const qualificationId = catalogs.rows.find((row) => row.kind === 'qual')?.id;
    assert.ok(specializationId && qualificationId);

    async function doctorLogin(jar: Jar, doctorName: string, email: string) {
      const created = await api('/clinic/doctors', {
        method: 'POST',
        jar,
        json: { fullName: doctorName, specializationId, qualificationId, confirmDuplicate: true },
      });
      assert.ok(created.status < 300, JSON.stringify(created.body));
      const doctorId = (created.body as { id: string }).id;
      const invite = await api(`/clinic/doctors/${doctorId}/invitations`, { method: 'POST', jar, json: { email } });
      assert.equal(invite.status, 201, JSON.stringify(invite.body));
      const token = new URL((invite.body as { acceptUrl: string }).acceptUrl).searchParams.get('token');
      assert.equal(
        (await api('/doctor/invitations/accept', {
          method: 'POST',
          jar: publicJar,
          json: { token, name: doctorName, password: `DoctorPass1!${suffix}` },
        })).status,
        201,
      );
      await api(`/clinic/doctors/${doctorId}/credential-review`, { method: 'POST', jar, json: { status: 'VERIFIED' } });
      const doctorJar: Jar = { cookie: '', csrf: '' };
      await getCsrf(doctorJar);
      const login = await api('/clinic-auth/login', {
        method: 'POST',
        jar: doctorJar,
        json: { email, password: `DoctorPass1!${suffix}` },
      });
      assert.equal((login.body as { user: { role: string } }).user.role, 'clinic_doctor');
      return { doctorId, doctorJar };
    }

    const doctorA = await doctorLogin(managerJars[0]!, `Dr A ${suffix}`, `doc_a_${suffix}@example.com`);
    const doctorB = await doctorLogin(managerJars[0]!, `Dr B ${suffix}`, `doc_b_${suffix}@example.com`);
    const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const session = await api('/clinic/sessions', {
      method: 'POST',
      jar: managerJars[0]!,
      json: { doctorId: doctorA.doctorId, localDate: tomorrow, startTime: '09:00', endTime: '12:00', capacity: 10, expectedDurationMinutes: 10 },
    });
    assert.ok(session.status < 300, JSON.stringify(session.body));
    const sessionId = (session.body as { id: string }).id;
    const patient = await api('/clinic/patients', {
      method: 'POST',
      jar: managerJars[0]!,
      json: { fullName: `Clin Patient ${suffix}`, sex: 'UNKNOWN', contacts: [{ contactType: 'MOBILE', value: '0775555555', isPrimary: true }], confirmSharedPhone: true },
    });
    const patientId = (patient.body as { id: string }).id;
    const appointment = await api('/clinic/appointments', {
      method: 'POST',
      jar: managerJars[0]!,
      json: { patientId, sessionId, bookingSource: 'WALK_IN', idempotencyKey: `clin-${suffix}` },
    });
    assert.ok(appointment.status < 300, JSON.stringify(appointment.body));
    const appointmentId = (appointment.body as { id: string }).id;
    assert.ok((await api(`/clinic/sessions/${sessionId}/open`, { method: 'POST', jar: managerJars[0]!, json: {} })).status < 300);
    assert.ok((await api(`/clinic/appointments/${appointmentId}/check-in`, { method: 'POST', jar: managerJars[0]!, json: {} })).status < 300);
    const called = await api(`/clinic/sessions/${sessionId}/queue/call-next`, { method: 'POST', jar: managerJars[0]!, json: {} });
    assert.ok(called.status < 300, JSON.stringify(called.body));
    const entryId = (called.body as { called: Array<{ id: string }> }).called[0]?.id;
    assert.ok(entryId);

    const encounter = await api('/clinic/encounters', { method: 'POST', jar: doctorA.doctorJar, json: { appointmentId } });
    assert.equal(encounter.status, 201, JSON.stringify(encounter.body));
    const encounterId = (encounter.body as { id: string; version: number }).id;
    const draft = await api(`/clinic/encounters/${encounterId}/draft`, {
      method: 'POST',
      jar: doctorA.doctorJar,
      json: { version: 1, chiefComplaint: 'Synthetic cough', assessment: 'Test assessment' },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const managerSign = await api(`/clinic/encounters/${encounterId}/sign`, {
      method: 'POST',
      jar: managerJars[0]!,
      json: { version: (draft.body as { version: number }).version },
    });
    assert.equal(managerSign.status, 403);
    const otherDoctor = await api(`/clinic/encounters/${encounterId}`, { jar: doctorB.doctorJar });
    assert.ok(otherDoctor.status === 403 || otherDoctor.status === 404);
    const otherClinic = await api(`/clinic/encounters/${encounterId}`, { jar: managerJars[1]! });
    assert.ok(otherClinic.status === 403 || otherClinic.status === 404);
    assert.ok((await api(`/clinic/queue/${entryId}/start-turn`, { method: 'POST', jar: managerJars[0]!, json: {} })).status < 300);
    const finished = await api(`/clinic/queue/${entryId}/finish-turn`, { method: 'POST', jar: managerJars[0]!, json: {} });
    assert.ok(finished.status < 300, JSON.stringify(finished.body));
    const stillDraft = await api(`/clinic/encounters/${encounterId}`, { jar: doctorA.doctorJar });
    assert.equal((stillDraft.body as { status: string }).status, 'DRAFT');
    const signed = await api(`/clinic/encounters/${encounterId}/sign`, {
      method: 'POST',
      jar: doctorA.doctorJar,
      json: { version: (draft.body as { version: number }).version },
    });
    assert.equal(signed.status, 201, JSON.stringify(signed.body));
    assert.equal((signed.body as { status: string }).status, 'SIGNED');
    const edited = await api(`/clinic/encounters/${encounterId}/draft`, {
      method: 'POST',
      jar: doctorA.doctorJar,
      json: { version: (signed.body as { version: number }).version, chiefComplaint: 'Changed' },
    });
    assert.equal(edited.status, 409);
    const rx = await api(`/clinic/encounters/${encounterId}/prescriptions`, { method: 'POST', jar: doctorA.doctorJar, json: {} });
    assert.equal(rx.status, 201, JSON.stringify(rx.body));
    const rxId = (rx.body as { id: string; version: number }).id;
    const rxDraft = await api(`/clinic/prescriptions/${rxId}/draft`, {
      method: 'POST',
      jar: doctorA.doctorJar,
      json: {
        version: (rx.body as { version: number }).version,
        items: [{ medicineName: 'Demo tablet', dose: '1', frequency: 'once', instructions: 'Synthetic only' }],
      },
    });
    assert.equal(rxDraft.status, 201, JSON.stringify(rxDraft.body));
    const rxSigned = await api(`/clinic/prescriptions/${rxId}/sign`, {
      method: 'POST',
      jar: doctorA.doctorJar,
      json: { version: (rxDraft.body as { version: number }).version },
    });
    assert.equal(rxSigned.status, 201, JSON.stringify(rxSigned.body));
    const print = await api(`/clinic/prescriptions/${rxId}/print`, { jar: doctorA.doctorJar });
    assert.equal(print.status, 200);
    assert.match(String(print.body), /Demo tablet/);
    const managerPrint = await api(`/clinic/prescriptions/${rxId}/print`, { jar: managerJars[0]! });
    assert.equal(managerPrint.status === 401 || managerPrint.status === 403, true);
    const track = await api(`/clinic/appointments/${appointmentId}/tracking-link`, { method: 'POST', jar: managerJars[0]!, json: {} });
    const token = String((track.body as { url: string }).url).split('/track/')[1];
    const pub = await fetch(`${apiBase}/public/track/${token}`);
    const pubText = await pub.text();
    assert.equal(pubText.toLowerCase().includes('demo tablet'), false);
    assert.equal(pubText.toLowerCase().includes('synthetic cough'), false);
  });
});
