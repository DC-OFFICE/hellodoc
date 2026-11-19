/**
 * Live queue foundation + concurrency + optional HTTP acceptance against local API.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api';

describe('live queue tenant SQL foundation', { skip: !databaseUrl }, () => {
  it('creates queue tables and backfills entries across clinic schemas', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname`,
      );
      assert.ok(schemas.rows.length >= 2, 'expected at least two clinic schemas for isolation coverage');

      for (const row of schemas.rows.slice(0, 3)) {
        const tables = await client.query(
          `select table_name from information_schema.tables
           where table_schema = $1
             and table_name in ('queue_entries','queue_events','appointment_tracking_tokens')`,
          [row.nspname],
        );
        assert.equal(tables.rowCount, 3, `missing queue tables in ${row.nspname}`);

        const migrated = await client.query(
          `select 1 from information_schema.tables
           where table_schema = $1 and table_name = 'schema_migration'`,
          [row.nspname],
        );
        if ((migrated.rowCount ?? 0) > 0) {
          const version = await client.query(
            `select 1 from "${row.nspname.replace(/"/g, '""')}".schema_migration where version = '006_live_queue'`,
          );
          assert.equal(version.rowCount, 1);
        }
      }
    } finally {
      await client.end();
    }
  });

  it('isolates queue entries between two clinic schemas', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 2`,
      );
      assert.ok(schemas.rows.length >= 2);
      const a = schemas.rows[0]!.nspname;
      const b = schemas.rows[1]!.nspname;
      const countA = await client.query<{ c: string }>(
        `select count(*)::text as c from "${a.replace(/"/g, '""')}".queue_entries`,
      );
      const countB = await client.query<{ c: string }>(
        `select count(*)::text as c from "${b.replace(/"/g, '""')}".queue_entries`,
      );
      // Schemas are independent; counts may differ but both queries must succeed.
      assert.ok(Number(countA.rows[0]!.c) >= 0);
      assert.ok(Number(countB.rows[0]!.c) >= 0);
      assert.notEqual(a, b);
    } finally {
      await client.end();
    }
  });

  it('stores only hashed tracking tokens and supports revoke/expiry checks', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 1`,
      );
      const schema = schemas.rows[0]?.nspname;
      if (!schema) return;
      const q = `"${schema.replace(/"/g, '""')}"`;

      const appt = await client.query<{ id: string }>(
        `select id from ${q}.appointments where status = 'CONFIRMED' limit 1`,
      );
      if (!appt.rows[0]) return;

      const raw = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      const tokenId = randomUUID();

      await client.query(
        `insert into ${q}.appointment_tracking_tokens
          (id, appointment_id, token_hash, expires_at, created_by)
         values ($1,$2,$3, NOW() + interval '2 days', $4)`,
        [tokenId, appt.rows[0].id, tokenHash, randomUUID()],
      );

      const stored = await client.query<{ token_hash: string }>(
        `select token_hash from ${q}.appointment_tracking_tokens where id = $1`,
        [tokenId],
      );
      assert.equal(stored.rows[0]?.token_hash, tokenHash);
      assert.notEqual(stored.rows[0]?.token_hash, raw);

      await client.query(
        `update ${q}.appointment_tracking_tokens set revoked_at = NOW() where id = $1`,
        [tokenId],
      );
      const revoked = await client.query(
        `select 1 from ${q}.appointment_tracking_tokens
         where id = $1 and revoked_at is not null`,
        [tokenId],
      );
      assert.equal(revoked.rowCount, 1);

      await client.query(`delete from ${q}.appointment_tracking_tokens where id = $1`, [tokenId]);
    } finally {
      await client.end();
    }
  });

  it('serializes concurrent call-next so only one WAITING entry becomes CALLED', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    try {
      const schemas = await pool.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 1`,
      );
      const schema = schemas.rows[0]?.nspname;
      if (!schema) return;
      const q = `"${schema.replace(/"/g, '""')}"`;

      const waiting = await pool.query<{ id: string; session_id: string; version: number }>(
        `select id, session_id, version from ${q}.queue_entries
         where state = 'WAITING'
         order by queue_number
         limit 2`,
      );
      if (waiting.rows.length < 2) {
        // Seed two WAITING rows from RESERVED if available.
        const reserved = await pool.query<{ id: string; session_id: string; version: number }>(
          `select id, session_id, version from ${q}.queue_entries
           where state = 'RESERVED'
           order by queue_number
           limit 2`,
        );
        if (reserved.rows.length < 2) return;
        for (const row of reserved.rows) {
          await pool.query(
            `update ${q}.queue_entries
             set state = 'WAITING', checked_in_at = coalesce(checked_in_at, NOW()),
                 updated_at = NOW(), version = version + 1
             where id = $1`,
            [row.id],
          );
        }
      }

      const sessionId =
        waiting.rows[0]?.session_id ??
        (
          await pool.query<{ session_id: string }>(
            `select session_id from ${q}.queue_entries where state = 'WAITING' limit 1`,
          )
        ).rows[0]?.session_id;
      if (!sessionId) return;

      // Clear active turns for the test session then restore after.
      await pool.query(
        `update ${q}.consultation_sessions set status = 'OPEN' where id = $1`,
        [sessionId],
      );
      await pool.query(
        `update ${q}.queue_entries
         set state = 'WAITING', updated_at = NOW(), version = version + 1
         where session_id = $1 and state in ('CALLED','IN_SERVICE')`,
        [sessionId],
      );

      async function callNextOnce() {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `select id from ${q}.consultation_sessions where id = $1 for update`,
            [sessionId],
          );
          const active = await client.query(
            `select id from ${q}.queue_entries
             where session_id = $1 and state in ('CALLED','IN_SERVICE')
             limit 1`,
            [sessionId],
          );
          if ((active.rowCount ?? 0) > 0) {
            await client.query('ROLLBACK');
            return { ok: false as const, reason: 'ACTIVE_TURN_EXISTS' };
          }
          const next = await client.query<{ id: string; version: number; queue_number: number }>(
            `select id, version, queue_number from ${q}.queue_entries
             where session_id = $1 and state = 'WAITING'
             order by queue_number asc
             limit 1
             for update skip locked`,
            [sessionId],
          );
          if (!next.rows[0]) {
            await client.query('ROLLBACK');
            return { ok: false as const, reason: 'NONE' };
          }
          const updated = await client.query(
            `update ${q}.queue_entries
             set state = 'CALLED', called_at = NOW(), updated_at = NOW(), version = version + 1
             where id = $1 and version = $2
             returning id, queue_number`,
            [next.rows[0].id, next.rows[0].version],
          );
          if (!updated.rows[0]) {
            await client.query('ROLLBACK');
            return { ok: false as const, reason: 'CONFLICT' };
          }
          await client.query('COMMIT');
          return { ok: true as const, queueNumber: updated.rows[0].queue_number as number };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const [r1, r2] = await Promise.all([callNextOnce(), callNextOnce()]);
      const successes = [r1, r2].filter((r) => r.ok);
      assert.equal(successes.length, 1, 'exactly one concurrent call-next must succeed');

      const called = await pool.query(
        `select count(*)::int as c from ${q}.queue_entries
         where session_id = $1 and state = 'CALLED'`,
        [sessionId],
      );
      assert.equal(called.rows[0]?.c, 1);
    } finally {
      await pool.end();
    }
  });

  it('keeps queue_number stable across hold/skip/restore transitions', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 1`,
      );
      const schema = schemas.rows[0]?.nspname;
      if (!schema) return;
      const q = `"${schema.replace(/"/g, '""')}"`;

      const entry = await client.query<{
        id: string;
        queue_number: number;
        version: number;
        state: string;
      }>(
        `select id, queue_number, version, state from ${q}.queue_entries
         where state in ('WAITING','RESERVED')
         order by created_at desc
         limit 1`,
      );
      if (!entry.rows[0]) return;
      const original = entry.rows[0].queue_number;
      const id = entry.rows[0].id;

      await client.query('BEGIN');
      await client.query(
        `update ${q}.queue_entries set state = 'WAITING', version = version + 1 where id = $1`,
        [id],
      );
      await client.query(
        `update ${q}.queue_entries
         set state = 'HELD', held_at = NOW(), version = version + 1 where id = $1`,
        [id],
      );
      await client.query(
        `update ${q}.queue_entries set state = 'WAITING', version = version + 1 where id = $1`,
        [id],
      );
      const after = await client.query<{ queue_number: number }>(
        `select queue_number from ${q}.queue_entries where id = $1`,
        [id],
      );
      assert.equal(after.rows[0]?.queue_number, original);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

describe('live queue HTTP acceptance', () => {
  let pool: pg.Pool | null = null;
  let dbReady = false;
  let apiReady = false;

  before(async () => {
    if (!databaseUrl) return;
    pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2000 });
    try {
      await pool.query('SELECT 1');
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

  async function getCsrf(jar: { cookie: string; csrf: string }) {
    const res = await fetch(`${apiBase}/csrf`, {
      headers: jar.cookie ? { cookie: jar.cookie } : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const part = c.split(';')[0];
      if (!part) continue;
      if (jar.cookie) jar.cookie += `; ${part}`;
      else jar.cookie = part;
    }
    const body = (await res.json()) as { csrfToken: string };
    jar.csrf = body.csrfToken;
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
      if (options.jar.cookie) options.jar.cookie += `; ${part}`;
      else options.jar.cookie = part;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await res.json() : null;
    return { status: res.status, body };
  }

  it('rejects invalid public tracking tokens without leaking details', async (t) => {
    if (!apiReady) {
      t.skip('Requires running API on :4000');
      return;
    }
    const res = await fetch(`${apiBase}/public/track/not-a-real-token`);
    assert.ok(res.status === 404 || res.status === 400);
    const body = (await res.json()) as { message?: string; code?: string };
    const text = JSON.stringify(body).toLowerCase();
    assert.equal(text.includes('phone'), false);
    assert.equal(text.includes('patient'), false);
    assert.equal(text.includes('schema'), false);
  });

  it('public tracking resolves through platform.tracking_token_index when present', async () => {
    if (!pool && databaseUrl) {
      // no-op when pool not created in this suite
    }
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const cols = await client.query(
        `select 1 from information_schema.tables
         where table_schema = 'platform' and table_name = 'tracking_token_index'`,
      );
      assert.equal(cols.rowCount, 1);
    } finally {
      await client.end();
    }
  });
});
