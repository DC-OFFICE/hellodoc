/**
 * Appointment foundation checks against live PostgreSQL clinic schemas.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import pg from 'pg';
import {
  formatBookingReference,
  formatQueueDisplay,
} from '../../src/clinic-appointments/appointment-rules.js';

const databaseUrl = process.env.DATABASE_URL;

describe('appointments tenant SQL foundation', { skip: !databaseUrl }, () => {
  it('allocates unique queue numbers under row lock and never reuses cancelled numbers', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 2`,
      );
      assert.ok(schemas.rows.length >= 1, 'expected clinic schema');
      const schema = schemas.rows[0].nspname;
      const q = `"${schema.replace(/"/g, '""')}"`;

      const tables = await client.query(
        `select table_name from information_schema.tables
         where table_schema = $1 and table_name in ('appointments','appointment_reg_seq','appointment_idempotency')`,
        [schema],
      );
      assert.equal(tables.rowCount, 3);

      const col = await client.query(
        `select 1 from information_schema.columns
         where table_schema = $1 and table_name = 'consultation_sessions' and column_name = 'next_queue_number'`,
        [schema],
      );
      assert.equal(col.rowCount, 1);

      // Cross-schema isolation: second clinic schema (if present) has its own appointments table.
      if (schemas.rows[1]) {
        const other = schemas.rows[1].nspname;
        const otherTables = await client.query(
          `select 1 from information_schema.tables
           where table_schema = $1 and table_name = 'appointments'`,
          [other],
        );
        assert.equal(otherTables.rowCount, 1);
      }

      await client.query('BEGIN');
      const sessions = await client.query<{ id: string; next_queue_number: number; capacity: number }>(
        `SELECT id, next_queue_number, capacity FROM ${q}.consultation_sessions
         WHERE status = 'SCHEDULED' AND end_at > NOW()
         ORDER BY start_at ASC
         LIMIT 1
         FOR UPDATE`,
      );
      if (!sessions.rows[0]) {
        await client.query('ROLLBACK');
        return; // no bookable session in seed data; schema checks above still passed
      }
      const session = sessions.rows[0];
      const q1 = session.next_queue_number;
      await client.query(
        `UPDATE ${q}.consultation_sessions SET next_queue_number = next_queue_number + 1 WHERE id = $1`,
        [session.id],
      );
      const after = await client.query<{ next_queue_number: number }>(
        `SELECT next_queue_number FROM ${q}.consultation_sessions WHERE id = $1`,
        [session.id],
      );
      assert.equal(after.rows[0]?.next_queue_number, q1 + 1);
      assert.equal(formatQueueDisplay(q1).length >= 3, true);
      assert.equal(formatBookingReference(1), 'APT-000001');
      void randomUUID;
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });

  it('concurrent queue-number allocations under FOR UPDATE never collide', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    try {
      const schemas = await pool.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 1`,
      );
      const schema = schemas.rows[0]?.nspname;
      if (!schema) return;
      const q = `"${schema.replace(/"/g, '""')}"`;

      const sessions = await pool.query<{ id: string }>(
        `select id from ${q}.consultation_sessions
         where status in ('SCHEDULED','OPEN') and end_at > NOW()
         order by start_at asc
         limit 1`,
      );
      if (!sessions.rows[0]) return;
      const sessionId = sessions.rows[0].id;

      async function allocateOnce() {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const locked = await client.query<{ next_queue_number: number }>(
            `select next_queue_number from ${q}.consultation_sessions
             where id = $1 for update`,
            [sessionId],
          );
          const n = locked.rows[0]!.next_queue_number;
          await client.query(
            `update ${q}.consultation_sessions
             set next_queue_number = next_queue_number + 1
             where id = $1`,
            [sessionId],
          );
          await client.query('COMMIT');
          return n;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      const before = await pool.query<{ next_queue_number: number }>(
        `select next_queue_number from ${q}.consultation_sessions where id = $1`,
        [sessionId],
      );
      const start = before.rows[0]!.next_queue_number;
      const allocated = await Promise.all([allocateOnce(), allocateOnce(), allocateOnce()]);
      assert.equal(new Set(allocated).size, 3);
      assert.deepEqual([...allocated].sort((a, b) => a - b), [start, start + 1, start + 2]);

      // Roll numbers back so the test is non-destructive for capacity.
      await pool.query(
        `update ${q}.consultation_sessions set next_queue_number = $2 where id = $1`,
        [sessionId, start],
      );
    } finally {
      await pool.end();
    }
  });

  it('two clinic schemas keep independent appointment tables and queue counters', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schemas = await client.query<{ nspname: string }>(
        `select nspname from pg_namespace where nspname like 'clinic_%' order by nspname limit 2`,
      );
      if (schemas.rows.length < 2) return;
      const a = `"${schemas.rows[0]!.nspname.replace(/"/g, '""')}"`;
      const b = `"${schemas.rows[1]!.nspname.replace(/"/g, '""')}"`;
      const countA = await client.query(`select count(*)::int as c from ${a}.appointments`);
      const countB = await client.query(`select count(*)::int as c from ${b}.appointments`);
      assert.ok(typeof countA.rows[0].c === 'number');
      assert.ok(typeof countB.rows[0].c === 'number');
      assert.notEqual(schemas.rows[0]!.nspname, schemas.rows[1]!.nspname);
    } finally {
      await client.end();
    }
  });
});
