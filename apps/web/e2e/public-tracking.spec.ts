import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

test('public tracker shows safe queue status without private patient data', async ({ browser }) => {
  const credentials = loadCredentials();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(credentials.clinicA.trackingPath);
  await expect(publicPage.getByText(credentials.clinicA.clinicName)).toBeVisible();
  await expect(publicPage.getByText(/Queue|#\d+/i).first()).toBeVisible();
  const body = (await publicPage.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain(credentials.clinicA.seedPatientNumber.toLowerCase());
  expect(body).not.toContain('demo tablet');
  expect(body).not.toContain('clinic_');
  expect(body).not.toMatch(/077\d{7}/);

  const manager = await browser.newContext({
    storageState: join(process.cwd(), 'e2e', '.auth', 'manager-a.json'),
  });
  const managerPage = await manager.newPage();
  await managerPage.goto(`/sessions/${credentials.clinicA.doctorSessionId}/queue`);
  await expect(managerPage.getByText(/Queue|Waiting|Called/i).first()).toBeVisible();

  await publicPage.reload();
  await expect(publicPage.getByText(credentials.clinicA.clinicName)).toBeVisible();

  await publicPage.goto('/track/not-a-real-token');
  await expect(publicPage.getByText(/invalid or expired/i)).toBeVisible();

  await publicContext.close();
  await manager.close();
});
