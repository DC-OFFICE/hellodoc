/**
 * One-time local bootstrap for a DartCodes platform administrator.
 * Usage (from repo root):
 *   npm run create-platform-admin -w @hellodoc/api -- --email=admin@dartcodes.lk --name="DartCodes Admin" --password="YourStrongPass1!"
 */
import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const email = arg('email');
const name = arg('name');
const password = arg('password');

if (!email || !name || !password) {
  console.error('Required: --email= --name= --password=');
  process.exit(1);
}
if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  console.error('Password must be at least 10 chars and include upper, lower, number, special');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const emailNormalized = email.trim().toLowerCase();
const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const existing = await client.query(
    `SELECT id FROM platform."PlatformUser" WHERE "emailNormalized" = $1`,
    [emailNormalized],
  );
  let userId;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    await client.query(
      `UPDATE platform."PlatformUser"
       SET name = $2, email = $3, "passwordHash" = $4, active = true, "updatedAt" = NOW()
       WHERE id = $1`,
      [userId, name, email.trim(), passwordHash],
    );
  } else {
    userId = randomUUID();
    await client.query(
      `INSERT INTO platform."PlatformUser"
        (id, name, email, "emailNormalized", "passwordHash", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      [userId, name, email.trim(), emailNormalized, passwordHash],
    );
  }

  await client.query(
    `INSERT INTO platform."PlatformAdmin" (id, "userId", active, "createdAt")
     VALUES ($1,$2,true,NOW())
     ON CONFLICT ("userId") DO UPDATE SET active = true`,
    [randomUUID(), userId],
  );
  await client.query('COMMIT');
  console.log(`Platform administrator ready for ${emailNormalized}`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
