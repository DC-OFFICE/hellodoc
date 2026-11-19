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
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    if (res.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    return { status: res.status, body };
  }
  return { status: 429, body: null };
}

describe('billing', () => {
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

  it('adds billing tables without assuming VAT', async (t) => {
    if (!dbReady || !pool) {
      t.skip('database unavailable');
      return;
    }
    const schemas = await pool.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'clinic_%' ORDER BY nspname LIMIT 2`,
    );
    assert.ok(schemas.rows.length >= 1);
    for (const row of schemas.rows) {
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name IN ('invoices','payments','payment_refunds','invoice_credit_notes')`,
        [row.nspname],
      );
      assert.equal(tables.rowCount, 4);
    }
  });

  it('records partial payments once, blocks overpay, and isolates clinics', async (t) => {
    if (!dbReady || !apiReady || !pool) {
      t.skip('Requires migrated PostgreSQL and running API');
      return;
    }
    const suffix = randomBytes(3).toString('hex');
    const adminEmail = `bill_admin_${suffix}@dartcodes.test`;
    const adminPass = `AdminPass1!${suffix}`;
    const adminId = randomUUID();
    await pool.query(
      `INSERT INTO platform."PlatformUser"
        (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      [adminId, 'Bill Admin', adminEmail, adminEmail, await argon2.hash(adminPass, { type: argon2.argon2id })],
    );
    await pool.query(
      `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt") VALUES ($1,$2,true,NOW())`,
      [randomUUID(), adminId],
    );
    const clinics = [
      { clinicName: `Bill A ${suffix}`, ownerName: 'Owner A', email: `bill_a_${suffix}@example.com`, mobile: '0772000001', address: 'Colombo', password: `ClinicPass1!${suffix}` },
      { clinicName: `Bill B ${suffix}`, ownerName: 'Owner B', email: `bill_b_${suffix}@example.com`, mobile: '0772000002', address: 'Kandy', password: `ClinicPass1!${suffix}` },
    ];
    const publicJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(publicJar);
    for (const clinic of clinics) {
      const reg = await api('/clinic-registrations', {
        method: 'POST',
        jar: publicJar,
        json: { ...clinic, confirmPassword: clinic.password, acceptTerms: true },
      });
      assert.equal(reg.status, 200, JSON.stringify(reg.body));
    }
    const adminJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(adminJar);
    assert.equal((await api('/platform-auth/login', { method: 'POST', jar: adminJar, json: { email: adminEmail, password: adminPass } })).status, 200);
    const regs = await api('/platform/registrations', { jar: adminJar });
    const pending = (regs.body as Array<{ id: string; clinicName: string; status: string }>).filter(
      (row) => row.status === 'PENDING_APPROVAL' && clinics.some((clinic) => clinic.clinicName === row.clinicName),
    );
    for (const reg of pending) {
      const approved = await api(`/platform/registrations/${reg.id}/approve`, { method: 'POST', jar: adminJar, json: {} });
      assert.ok(approved.status === 200 || approved.status === 201);
    }
    const jars: Jar[] = [];
    for (const clinic of clinics) {
      const jar: Jar = { cookie: '', csrf: '' };
      await getCsrf(jar);
      const login = await api('/clinic-auth/login', { method: 'POST', jar, json: { email: clinic.email, password: clinic.password } });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      jars.push(jar);
    }
    const service = await api('/clinic/billing/services', {
      method: 'POST',
      jar: jars[0]!,
      json: { code: 'CONSULT', name: 'General consultation', price: '2000.00', taxClassification: 'UNCLASSIFIED' },
    });
    assert.equal(service.status, 201, JSON.stringify(service.body));
    const serviceId = (service.body as { id: string }).id;
    const patient = await api('/clinic/patients', {
      method: 'POST',
      jar: jars[0]!,
      json: { fullName: `Bill Patient ${suffix}`, sex: 'UNKNOWN', contacts: [{ contactType: 'MOBILE', value: '0771234567', isPrimary: true }], confirmSharedPhone: true },
    });
    assert.ok(patient.status === 200 || patient.status === 201, JSON.stringify(patient.body));
    const patientId = (patient.body as { id: string }).id;

    async function issuedInvoice() {
      const draft = await api('/clinic/invoices', {
        method: 'POST',
        jar: jars[0]!,
        json: { patientId, items: [{ serviceId, quantity: 1, discount: '0.00' }] },
      });
      assert.equal(draft.status, 201, JSON.stringify(draft.body));
      const id = (draft.body as { id: string }).id;
      const issued = await api(`/clinic/invoices/${id}/issue`, { method: 'POST', jar: jars[0]!, json: {} });
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      assert.equal((issued.body as { invoiceTotal: string }).invoiceTotal, '2000.00');
      assert.match((issued.body as { invoiceNumber: string }).invoiceNumber, /^INV-/);
      return issued.body as { id: string; balance: string; payments: unknown[] };
    }

    const first = await issuedInvoice();
    const key = `pay-${suffix}-1`;
    const partial = await api(`/clinic/invoices/${first.id}/payments`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '1000.00', method: 'CASH', idempotencyKey: key },
    });
    assert.equal(partial.status, 201, JSON.stringify(partial.body));
    assert.equal((partial.body as { balance: string }).balance, '1000.00');
    const replay = await api(`/clinic/invoices/${first.id}/payments`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '1000.00', method: 'CASH', idempotencyKey: key },
    });
    assert.equal(replay.status, 201);
    assert.equal((replay.body as { payments: unknown[] }).payments.length, 1);
    const rest = await api(`/clinic/invoices/${first.id}/payments`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '1000.00', method: 'CARD_EXTERNAL', externalReference: 'TERM-1', idempotencyKey: `pay-${suffix}-2` },
    });
    assert.equal(rest.status, 201, JSON.stringify(rest.body));
    assert.equal((rest.body as { settlement: string }).settlement, 'PAID');

    const second = await issuedInvoice();
    const [left, right] = await Promise.all([
      api(`/clinic/invoices/${second.id}/payments`, {
        method: 'POST',
        jar: jars[0]!,
        json: { amount: '2000.00', method: 'CASH', idempotencyKey: `race-a-${suffix}` },
      }),
      api(`/clinic/invoices/${second.id}/payments`, {
        method: 'POST',
        jar: jars[0]!,
        json: { amount: '2000.00', method: 'CASH', idempotencyKey: `race-b-${suffix}` },
      }),
    ]);
    const statuses = [left.status, right.status].sort();
    assert.deepEqual(statuses, [201, 400]);
    const afterRace = await api(`/clinic/invoices/${second.id}`, { jar: jars[0]! });
    assert.equal((afterRace.body as { payments: unknown[]; balance: string }).payments.length, 1);
    assert.equal((afterRace.body as { balance: string }).balance, '0.00');

    const paymentId = (rest.body as { payments: Array<{ id: string }> }).payments.at(-1)?.id;
    assert.ok(paymentId);
    const refund = await api(`/clinic/payments/${paymentId}/refunds`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '200.00', method: 'CASH', reason: 'Test return of cash', idempotencyKey: `rf-${suffix}` },
    });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.equal((refund.body as { invoiceTotal: string }).invoiceTotal, '2000.00');
    const tooMuch = await api(`/clinic/payments/${paymentId}/refunds`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '5000.00', method: 'CASH', reason: 'Too much', idempotencyKey: `rf-big-${suffix}` },
    });
    assert.equal(tooMuch.status, 409);

    const credit = await api(`/clinic/invoices/${first.id}/credit-notes`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '100.00', reason: 'Courtesy reduction', idempotencyKey: `cn-${suffix}` },
    });
    assert.equal(credit.status, 201, JSON.stringify(credit.body));
    const hugeCredit = await api(`/clinic/invoices/${first.id}/credit-notes`, {
      method: 'POST',
      jar: jars[0]!,
      json: { amount: '5000.00', reason: 'Too large', idempotencyKey: `cn-big-${suffix}` },
    });
    assert.equal(hugeCredit.status, 409);

    const report = await api('/clinic/billing/reports/daily', { jar: jars[0]! });
    assert.equal(report.status, 200);
    const daily = report.body as { collections: string; refunds: string; netCollections: string; invoiced: string };
    assert.equal(daily.collections, '4000.00');
    assert.equal(daily.refunds, '200.00');
    assert.equal(daily.netCollections, '3800.00');
    assert.equal(daily.invoiced, '4000.00');

    const stolen = await api(`/clinic/invoices/${first.id}`, { jar: jars[1]! });
    assert.ok(stolen.status === 404 || stolen.status === 403);
    const stolenPay = await api(`/clinic/invoices/${first.id}/payments`, {
      method: 'POST',
      jar: jars[1]!,
      json: { amount: '1.00', method: 'CASH', idempotencyKey: `steal-${suffix}` },
    });
    assert.ok(stolenPay.status === 404 || stolenPay.status === 403);
    const stolenReport = await api('/clinic/billing/reports/daily', { jar: jars[1]! });
    assert.equal((stolenReport.body as { collections: string }).collections, '0.00');
    const adminInvoices = await api('/clinic/invoices', { jar: adminJar });
    assert.ok(adminInvoices.status === 401 || adminInvoices.status === 403);

    const invite = await api('/clinic/staff/cashier-invitations', {
      method: 'POST',
      jar: jars[0]!,
      json: { email: `cashier_${suffix}@example.com` },
    });
    assert.equal(invite.status, 201, JSON.stringify(invite.body));
    const token = new URL((invite.body as { acceptUrl: string }).acceptUrl).searchParams.get('token');
    const accept = await api('/staff/invitations/accept', {
      method: 'POST',
      jar: publicJar,
      json: { token, name: 'Cashier One', password: `CashierPass1!${suffix}` },
    });
    assert.equal(accept.status, 201, JSON.stringify(accept.body));
    const cashierJar: Jar = { cookie: '', csrf: '' };
    await getCsrf(cashierJar);
    const cashierLogin = await api('/clinic-auth/login', {
      method: 'POST',
      jar: cashierJar,
      json: { email: `cashier_${suffix}@example.com`, password: `CashierPass1!${suffix}` },
    });
    assert.equal((cashierLogin.body as { user: { role: string } }).user.role, 'clinic_cashier');
    const deniedSettings = await api('/clinic/billing/settings', {
      method: 'PATCH',
      jar: cashierJar,
      json: { displayName: 'Changed' },
    });
    assert.equal(deniedSettings.status, 403);
    const deniedRefund = await api(`/clinic/payments/${paymentId}/refunds`, {
      method: 'POST',
      jar: cashierJar,
      json: { amount: '1.00', method: 'CASH', reason: 'Cashier refund', idempotencyKey: `no-${suffix}` },
    });
    assert.equal(deniedRefund.status, 403);
    const csv = await fetch(`${apiBase}/clinic/billing/reports/export`, { headers: { cookie: jars[0]!.cookie } });
    assert.equal(csv.status, 200);
    const csvText = await csv.text();
    assert.equal(csvText.includes('=CMD'), false);
    assert.match(csvText, /net_collections/);
  });
});
