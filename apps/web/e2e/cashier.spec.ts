import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

test.use({ storageState: join(process.cwd(), 'e2e', '.auth', 'cashier-a.json') });

test('cashier: issue invoice, partial payment, full payment', async ({ page }) => {
  const credentials = loadCredentials();
  await page.goto('/billing/invoices/new');
  await expect(page.getByRole('heading', { name: 'New invoice' })).toBeVisible();

  const patientSelect = page.locator('select').first();
  await expect
    .poll(async () => patientSelect.locator('option').count(), { timeout: 20_000 })
    .toBeGreaterThan(1);
  const patientValue = await patientSelect.locator('option').evaluateAll((options, number) => {
    const match = options.find((option) => (option.textContent ?? '').includes(number));
    return match?.getAttribute('value') ?? '';
  }, credentials.clinicA.seedPatientNumber);
  expect(patientValue).not.toEqual('');
  await patientSelect.selectOption(patientValue);
  const serviceSelect = page.locator('select').nth(1);
  await expect.poll(async () => serviceSelect.locator('option').count(), { timeout: 20_000 }).toBeGreaterThan(0);
  const serviceCount = await serviceSelect.locator('option').count();
  await serviceSelect.selectOption({ index: serviceCount > 1 ? 1 : 0 });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/billing\/invoices\/[0-9a-f-]{36}/i);
  await expect(page.getByText(/Draft invoice|DRAFT/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(page.getByText('Issued INV-', { exact: false })).toBeVisible();
  await expect(
    page.getByText(/Total LKR 2000\.00 · Paid LKR 0\.00 · Balance LKR 2000\.00/),
  ).toBeVisible();

  await page.getByLabel('Amount').fill('800.00');
  await page.locator('select').filter({ hasText: 'Cash' }).selectOption('CASH');
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(
    page.getByText(/Total LKR 2000\.00 · Paid LKR 800\.00 · Balance LKR 1200\.00/),
  ).toBeVisible();
  await expect(page.getByText(/Settlement: PARTIALLY_PAID/)).toBeVisible();

  await page.getByLabel('Amount').fill('1200.00');
  await page.locator('select').filter({ hasText: 'Cash' }).selectOption('CARD_EXTERNAL');
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByText(/Settlement: PAID/)).toBeVisible();
  await expect(
    page.getByText(/Total LKR 2000\.00 · Paid LKR 2000\.00 · Balance LKR 0\.00/),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText(/Total LKR 2000\.00 · Paid LKR 2000\.00 · Balance LKR 0\.00/),
  ).toBeVisible();


  const denied = await page.evaluate(async () => {
    const res = await fetch('http://localhost:4000/api/doctor/worklist', { credentials: 'include' });
    return res.status;
  });
  expect([401, 403]).toContain(denied);

  const settings = await page.evaluate(async () => {
    const csrf = await fetch('http://localhost:4000/api/csrf', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('http://localhost:4000/api/clinic/billing/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.csrfToken },
      body: JSON.stringify({ displayName: 'should-fail' }),
    });
    return res.status;
  });
  expect([401, 403]).toContain(settings);
});
