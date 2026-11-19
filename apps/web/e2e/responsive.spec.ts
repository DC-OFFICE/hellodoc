import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

test.use({ storageState: join(process.cwd(), 'e2e', '.auth', 'manager-a.json') });

test('authenticated navigation remains usable on this viewport', async ({ page }) => {
  const credentials = loadCredentials();
  await page.goto('/patients');
  await expect(page.getByRole('link', { name: /Register Patient|Patients/i }).first()).toBeVisible();
  // Mobile keeps the clinic name inside the collapsible sidebar.
  const sidebarToggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
  }
  await expect(page.getByText(credentials.clinicA.clinicName).first()).toBeVisible({ timeout: 15_000 });

  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.documentElement;
    return main.scrollWidth - main.clientWidth;
  });
  expect(overflow).toBeLessThan(48);

  await page.goto('/appointments/new');
  await expect(page.getByRole('heading', { name: /Book appointment/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search patients' })).toBeVisible();

  await page.goto(`/sessions/${credentials.clinicA.bookingSessionId}/queue`);
  await expect(page.getByText(/Waiting|Reserved|Queue|status/i).first()).toBeVisible();
});

test('doctor and cashier screens remain usable on this viewport', async ({ browser }) => {
  const doctor = await browser.newContext({
    storageState: join(process.cwd(), 'e2e', '.auth', 'doctor-a.json'),
  });
  const doctorPage = await doctor.newPage();
  await doctorPage.goto('/doctor/worklist');
  await expect(doctorPage.getByRole('heading', { name: /worklist/i })).toBeVisible();
  await doctor.close();

  const cashier = await browser.newContext({
    storageState: join(process.cwd(), 'e2e', '.auth', 'cashier-a.json'),
  });
  const cashierPage = await cashier.newPage();
  await cashierPage.goto('/billing/invoices');
  await expect(cashierPage.getByText(/invoice|billing/i).first()).toBeVisible();
  const overflow = await cashierPage.evaluate(() => {
    const main = document.querySelector('main') ?? document.documentElement;
    return main.scrollWidth - main.clientWidth;
  });
  expect(overflow).toBeLessThan(48);
  await cashier.close();
});
