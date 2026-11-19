/**
 * End-to-end Phase 1 API flow against local PostgreSQL.
 * Skips when DATABASE_URL is unreachable or platform tables are missing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api';

let pool: pg.Pool | null = null;
let dbReady = false;
let apiReady = false;

async function getCsrf(cookieJar: { cookie: string; csrf: string }) {
  const res = await fetch(`${apiBase}/csrf`, {
    headers: cookieJar.cookie ? { cookie: cookieJar.cookie } : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const part = c.split(';')[0];
    if (!part) continue;
    if (cookieJar.cookie) cookieJar.cookie += `; ${part}`;
    else cookieJar.cookie = part;
  }
  const body = (await res.json()) as { csrfToken: string };
  cookieJar.csrf = body.csrfToken;
}

async function api(
  path: string,
  options: { method?: string; json?: unknown; jar: { cookie: string; csrf: string } },
) {
  const method = options.method ?? 'GET';
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
    if (options.jar.cookie.includes(part.split('=')[0]!)) {
      options.jar.cookie = options.jar.cookie
        .split('; ')
        .filter((x) => !x.startsWith(part.split('=')[0]! + '='))
        .concat(part)
        .join('; ');
    } else if (options.jar.cookie) {
      options.jar.cookie += `; ${part}`;
    } else {
      options.jar.cookie = part;
    }
  }
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : null;
  return { status: res.status, body };
}

describe('phase1 saas flow', () => {
  before(async () => {
    if (!databaseUrl) return;
    pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2000 });
    try {
      await pool.query('SELECT 1 FROM platform."PlatformUser" LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
    try {
      const health = await fetch(`${apiBase}/health`);
      apiReady = health.ok;
    } catch {
      apiReady = false;
    }
  });

  after(async () => {
    await pool?.end();
  });

  it('registers, approves, and isolates two clinics when API+DB are up', async (t) => {
    if (!dbReady || !apiReady) {
      t.skip('Requires migrated PostgreSQL and running API on :4000');
      return;
    }

    const suffix = randomBytes(3).toString('hex');
    const adminEmail = `admin_${suffix}@dartcodes.test`;
    const adminPass = `AdminPass1!${suffix}`;
    const passwordHash = await argon2.hash(adminPass, { type: argon2.argon2id });

    const adminId = crypto.randomUUID();
    await pool!.query(
      `INSERT INTO platform."PlatformUser"
        (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      [adminId, 'Test Admin', adminEmail, adminEmail, passwordHash],
    );
    await pool!.query(
      `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt")
       VALUES ($1,$2,true,NOW())`,
      [crypto.randomUUID(), adminId],
    );

    const clinics = [
      {
        clinicName: `Hello Medi Help ${suffix}`,
        ownerName: 'Owner A',
        email: `owner_a_${suffix}@example.com`,
        mobile: '0770000001',
        address: 'Kandy Road 1',
        password: `ClinicPass1!${suffix}`,
      },
      {
        clinicName: `Second Care ${suffix}`,
        ownerName: 'Owner B',
        email: `owner_b_${suffix}@example.com`,
        mobile: '0770000002',
        address: 'Matale Road 2',
        password: `ClinicPass2!${suffix}`,
      },
    ];

    const publicJar = { cookie: '', csrf: '' };
    await getCsrf(publicJar);

    for (const clinic of clinics) {
      const reg = await api('/clinic-registrations', {
        method: 'POST',
        jar: publicJar,
        json: { ...clinic, confirmPassword: clinic.password, acceptTerms: true },
      });
      assert.equal(reg.status, 200);
    }

    const adminJar = { cookie: '', csrf: '' };
    await getCsrf(adminJar);
    const login = await api('/platform-auth/login', {
      method: 'POST',
      jar: adminJar,
      json: { email: adminEmail, password: adminPass },
    });
    assert.equal(login.status, 200);

    const regs = await api('/platform/registrations', { jar: adminJar });
    assert.equal(regs.status, 200);
    const pending = (regs.body as Array<{ id: string; clinicName: string; status: string }>).filter(
      (r) => r.status === 'PENDING_APPROVAL' && clinics.some((c) => c.clinicName === r.clinicName),
    );
    assert.equal(pending.length, 2);

    const schemas: string[] = [];
    for (const reg of pending) {
      const approved = await api(`/platform/registrations/${reg.id}/approve`, {
        method: 'POST',
        jar: adminJar,
        json: {},
      });
      assert.ok(approved.status === 201 || approved.status === 200);
      schemas.push((approved.body as { schemaName: string }).schemaName);
    }
    assert.equal(new Set(schemas).size, 2);

    for (let i = 0; i < clinics.length; i += 1) {
      const clinic = clinics[i]!;
      const jar = { cookie: '', csrf: '' };
      await getCsrf(jar);
      const clinicLogin = await api('/clinic-auth/login', {
        method: 'POST',
        jar,
        json: { email: clinic.email, password: clinic.password },
      });
      assert.equal(clinicLogin.status, 200);
      const me = await api('/clinic/me', { jar });
      assert.equal(me.status, 200);
      assert.equal((me.body as { clinicName: string }).clinicName, clinic.clinicName);

      const platformDenied = await api('/platform/clinics', { jar });
      assert.ok(platformDenied.status === 401 || platformDenied.status === 403);
    }

    const profileA = await pool!.query(
      `SELECT clinic_name FROM "${schemas[0]}".clinic_profile`,
    );
    const profileB = await pool!.query(
      `SELECT clinic_name FROM "${schemas[1]}".clinic_profile`,
    );
    assert.notEqual(profileA.rows[0].clinic_name, profileB.rows[0].clinic_name);
  });
});
