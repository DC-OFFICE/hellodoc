import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalSetup() {
  const root = dirname(fileURLToPath(import.meta.url));
  const seed = join(root, 'scripts', 'seed-e2e.mjs');
  const envFile = join(root, '..', '..', 'api', '.env');
  const args = existsSync(envFile) ? ['--env-file', envFile, seed] : [seed];
  const result = spawnSync(process.execPath, args, {
    cwd: join(root, '..'),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`E2E seed failed with status ${result.status}`);
  }
  console.log(result.stdout.trim());
}
