import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loginAs } from './helpers/auth';
import { loadCredentials } from './helpers/credentials';

const authDir = join(process.cwd(), 'e2e', '.auth');
mkdirSync(authDir, { recursive: true });

setup('authenticate clinic roles', async ({ browser }) => {
  const credentials = loadCredentials();
  expect(credentials.mfaRequired).toBeFalsy();

  const roles = [
    { key: 'manager-a', account: credentials.clinicA.manager, path: '/dashboard' },
    { key: 'doctor-a', account: credentials.clinicA.doctor, path: '/doctor/worklist' },
    { key: 'cashier-a', account: credentials.clinicA.cashier, path: '/billing/invoices' },
    { key: 'receptionist-a', account: credentials.clinicA.receptionist, path: '/patients' },
    { key: 'manager-b', account: credentials.clinicB.manager, path: '/dashboard' },
  ] as const;

  for (const role of roles) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, role.account, role.path);
    await context.storageState({ path: join(authDir, `${role.key}.json`) });
    await context.close();
  }
});
