/**
 * Dump the HelloDoc database and, when requested, restore that dump into a
 * different database. Never restores onto the source database.
 *
 * Usage (from apps/api):
 *   node --env-file=.env scripts/restore-check.mjs
 *
 * Modes:
 *   1) Dump-only (default): proves pg_dump writes a custom archive and
 *      pg_restore can list it. That is not a recovery test.
 *   2) RESTORE_TEST_URL=postgresql://.../other_db
 *      Restores into an existing empty database with a different name.
 *   3) RESTORE_TEST_CREATE=1
 *      Creates hellodoc_restore_check via createdb against the source host
 *      (requires CREATEDB), restores, verifies, then drops it.
 *   4) RESTORE_TEST_ISOLATED_CLUSTER=1
 *      Boots a temporary PostgreSQL 16 data directory (default under
 *      repo/.pg-restore-cluster), restores into hellodoc_restore_check on an
 *      unused local port, verifies platform + clinic schemas, then stops and
 *      deletes the cluster. Use when the application role cannot CREATE DATABASE
 *      on the primary host. Does not touch the source database.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const source = process.env.DATABASE_URL;
if (!source) {
  console.error('BLOCKED: DATABASE_URL is not set');
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const defaultClusterRoot = join(repoRoot, '.pg-restore-cluster');

function pgToolUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('schema');
  return parsed.toString();
}
function databaseName(url) {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

function tool(name) {
  const file = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.env.PG_BIN ? join(process.env.PG_BIN, file) : '',
    join('C:\\Program Files\\PostgreSQL\\16\\bin', file),
    join('/usr/lib/postgresql/16/bin', file),
    join('/usr/bin', file),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}

function run(command, args, env = process.env) {
  const result = spawnSync(tool(command), args, { encoding: 'utf8', env });
  if (result.error?.code === 'ENOENT') return { missing: true, status: 127, stdout: '', stderr: '' };
  return { missing: false, status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function startDetached(command, args, logFile) {
  const out = logFile ? openSync(logFile, 'a') : 'ignore';
  const child = spawn(tool(command), args, {
    detached: true,
    stdio: logFile ? ['ignore', out, out] : 'ignore',
    windowsHide: true,
  });
  child.unref();
  return child.pid ?? 0;
}

function sleep(ms) {
  spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/t', '1', '/nobreak'] : ['1'], {
    stdio: 'ignore',
    shell: true,
  });
  if (ms > 1000) {
    const extra = Math.floor(ms / 1000) - 1;
    for (let i = 0; i < extra; i += 1) {
      spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/t', '1', '/nobreak'] : ['1'], {
        stdio: 'ignore',
        shell: true,
      });
    }
  }
}

function redact(text) {
  return text.replace(/postgresql:\/\/\S+/gi, '[redacted]').trim();
}

const sourceName = databaseName(source);
let restoreUrl = process.env.RESTORE_TEST_URL?.trim() ?? '';
const createIsolated = process.env.RESTORE_TEST_CREATE === '1';
const isolatedCluster = process.env.RESTORE_TEST_ISOLATED_CLUSTER === '1';
const isolatedName = 'hellodoc_restore_check';
const clusterRoot = process.env.RESTORE_CLUSTER_DIR?.trim() || defaultClusterRoot;
const clusterPort = Number(process.env.RESTORE_CLUSTER_PORT || 55432);
const clusterPassword = 'restore_check_only';

if (createIsolated && isolatedCluster) {
  console.error('BLOCKED: set only one of RESTORE_TEST_CREATE=1 or RESTORE_TEST_ISOLATED_CLUSTER=1');
  process.exit(1);
}

if (createIsolated) {
  if (isolatedName === sourceName) {
    console.error('BLOCKED: isolated restore name matches the source database.');
    process.exit(1);
  }
  const target = new URL(source);
  target.pathname = `/${isolatedName}`;
  restoreUrl = target.toString();
}

if (restoreUrl && databaseName(restoreUrl) === sourceName) {
  console.error(
    'BLOCKED: RESTORE_TEST_URL uses the same database name as DATABASE_URL. Refusing to restore onto the source database.',
  );
  process.exit(1);
}

const directory = mkdtempSync(join(tmpdir(), 'hellodoc-backup-'));
const archive = join(directory, 'hellodoc.dump');
let clusterStarted = false;
const dataDir = join(clusterRoot, 'data');
const clusterLog = join(clusterRoot, 'postgres.log');

function stopCluster() {
  if (!clusterStarted && !existsSync(dataDir)) return;
  run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop']);
  clusterStarted = false;
}

try {
  const dump = run('pg_dump', ['--format=custom', '--no-owner', '--file', archive, pgToolUrl(source)]);
  if (dump.missing) {
    console.error('BLOCKED: pg_dump is not on PATH. Install PostgreSQL client tools and rerun this script.');
    process.exit(2);
  }
  if (dump.status !== 0) {
    console.error('BLOCKED: pg_dump failed.');
    console.error(redact(dump.stderr));
    process.exit(1);
  }
  const bytes = statSync(archive).size;
  const listed = run('pg_restore', ['--list', archive]);
  if (listed.missing || !listed.stdout.includes('TOC Entries')) {
    console.error(`BLOCKED: pg_restore could not read the archive (status ${listed.status}).`);
    const detail = redact(listed.stderr);
    if (detail) console.error(detail.slice(0, 800));
    process.exit(1);
  }
  const entries = listed.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith(';')).length;
  console.log(`DUMP_OK bytes=${bytes} archive_entries=${entries}`);
  console.log('The archive is written only in a temporary directory and is deleted after this check.');

  if (isolatedCluster) {
    mkdirSync(clusterRoot, { recursive: true });
    stopCluster();
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
    const pwFile = join(clusterRoot, 'pw.txt');
    writeFileSync(pwFile, clusterPassword, 'utf8');
    const init = run('initdb', [
      '-D',
      dataDir,
      '-U',
      'hellodoc',
      '--pwfile',
      pwFile,
      '-A',
      'scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ]);
    if (init.status !== 0) {
      console.error('RESTORE_FAILED: initdb could not create the isolated cluster.');
      console.error(redact(init.stderr || init.stdout).slice(0, 800));
      process.exit(1);
    }
    // Windows: `pg_ctl start` via spawnSync can hang forever after the server
    // is already accepting connections. Launch postgres detached and poll.
    startDetached(
      'postgres',
      [
        '-D',
        dataDir,
        '-p',
        String(clusterPort),
        '-c',
        'listen_addresses=127.0.0.1',
        // Temporary recovery-only cluster: keep memory small and skip durability.
        '-c',
        'shared_buffers=128MB',
        '-c',
        'work_mem=8MB',
        '-c',
        'maintenance_work_mem=64MB',
        '-c',
        'max_locks_per_transaction=256',
        '-c',
        'fsync=off',
        '-c',
        'synchronous_commit=off',
        '-c',
        'full_page_writes=off',
      ],
      clusterLog,
    );
    clusterStarted = true;
    const createEnv = { ...process.env, PGPASSWORD: clusterPassword };
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const ping = run(
        'pg_isready',
        ['-h', '127.0.0.1', '-p', String(clusterPort), '-U', 'hellodoc', '-d', 'postgres'],
        createEnv,
      );
      if (ping.status === 0) {
        ready = true;
        break;
      }
      sleep(1000);
    }
    if (!ready) {
      console.error('RESTORE_FAILED: isolated cluster did not become ready within 45s.');
      console.error(`See ${clusterLog} if present.`);
      process.exit(1);
    }
    run(
      'dropdb',
      ['-h', '127.0.0.1', '-p', String(clusterPort), '-U', 'hellodoc', '--if-exists', isolatedName],
      createEnv,
    );
    const created = run(
      'createdb',
      ['-h', '127.0.0.1', '-p', String(clusterPort), '-U', 'hellodoc', isolatedName],
      createEnv,
    );
    if (created.status !== 0) {
      console.error('RESTORE_FAILED: could not create hellodoc_restore_check on the isolated cluster.');
      console.error(redact(created.stderr));
      process.exit(1);
    }
    restoreUrl = `postgresql://hellodoc:${encodeURIComponent(clusterPassword)}@127.0.0.1:${clusterPort}/${isolatedName}`;
    console.log(`ISOLATED_CLUSTER_OK port=${clusterPort} database=${isolatedName}`);
  }

  if (!restoreUrl) {
    console.log(
      'RESTORE_BLOCKED: set RESTORE_TEST_URL to an empty database other than the source database, or set RESTORE_TEST_CREATE=1 / RESTORE_TEST_ISOLATED_CLUSTER=1.',
    );
    process.exit(0);
  }

  if (createIsolated) {
    const admin = new URL(source);
    admin.pathname = '/postgres';
    const created = run('createdb', ['--maintenance-db', pgToolUrl(admin.toString()), isolatedName]);
    if (created.status !== 0 && !/already exists/i.test(created.stderr)) {
      console.error('RESTORE_FAILED: could not create the isolated database.');
      console.error(redact(created.stderr));
      console.error('Hint: application roles often lack CREATEDB. Use RESTORE_TEST_ISOLATED_CLUSTER=1 instead.');
      process.exit(1);
    }
  }

  const restoreEnv = {
    ...process.env,
    PGPASSWORD: isolatedCluster ? clusterPassword : process.env.PGPASSWORD,
  };
  // Prefer host/port/user/dbname flags so the password stays in PGPASSWORD only.
  const restoreTarget = new URL(pgToolUrl(restoreUrl));
  const restored = run(
    'pg_restore',
    [
      '--no-owner',
      '--no-privileges',
      '--host',
      restoreTarget.hostname,
      '--port',
      restoreTarget.port || '5432',
      '--username',
      decodeURIComponent(restoreTarget.username),
      '--dbname',
      databaseName(restoreUrl),
      archive,
    ],
    restoreEnv,
  );
  if (restored.status !== 0) {
    const warning = redact(restored.stderr);
    console.log(`pg_restore exited ${restored.status}. Checking whether the isolated database is usable.`);
    if (warning) console.log(warning.split(/\r?\n/).slice(0, 20).join('\n'));
  }

  // Give a crashed temporary postmaster a moment to finish crash recovery.
  sleep(2000);
  let client;
  try {
    client = new pg.Client({
      connectionString: pgToolUrl(restoreUrl),
      password: isolatedCluster ? clusterPassword : undefined,
    });
    await client.connect();
    const check = await client.query(`SELECT to_regclass('platform."PlatformUser"') AS users`);
    if (!check.rows[0]?.users) {
      const schemaProbe = await client.query(
        `SELECT nspname FROM pg_namespace WHERE nspname = 'platform' OR nspname LIKE 'clinic_%' ORDER BY 1 LIMIT 10`,
      );
      console.error('RESTORE_FAILED: platform.PlatformUser was not present after restore.');
      console.error(`schemas_sample=${schemaProbe.rows.map((row) => row.nspname).join(',') || '(none)'}`);
      process.exit(1);
    }
    const schemas = await client.query(
      `SELECT count(*)::int AS schema_count
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`,
    );
    const users = await client.query(`SELECT count(*)::int AS n FROM platform."PlatformUser"`);
    console.log(
      `RESTORE_OK database=${databaseName(restoreUrl)} platform_users_table=present platform_user_rows=${users.rows[0].n} schema_count=${schemas.rows[0].schema_count}`,
    );
  } catch (err) {
    console.error(`RESTORE_FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await client?.end().catch(() => undefined);
  }

  if (createIsolated) {
    const admin = new URL(source);
    admin.pathname = '/postgres';
    const dropped = run('dropdb', ['--maintenance-db', pgToolUrl(admin.toString()), '--if-exists', isolatedName]);
    if (dropped.status !== 0) {
      console.error('The isolated database was restored but could not be dropped. Remove hellodoc_restore_check manually.');
      console.error(redact(dropped.stderr));
      process.exit(1);
    }
    console.log('Isolated restore database dropped after the check.');
  }
} finally {
  if (isolatedCluster) {
    stopCluster();
    rmSync(clusterRoot, { recursive: true, force: true });
    console.log('Isolated restore cluster stopped and deleted.');
  }
  rmSync(directory, { recursive: true, force: true });
}
