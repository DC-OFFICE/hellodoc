import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

test.use({ storageState: join(process.cwd(), 'e2e', '.auth', 'doctor-a.json') });

test('doctor: worklist, draft, sign, prescription, print', async ({ page }) => {
  const credentials = loadCredentials();
  await page.goto('/doctor/worklist');
  await expect(page.getByRole('heading', { name: /worklist/i })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: credentials.clinicA.clinicName })).toBeVisible();
  await expect(page.getByText(credentials.clinicA.seedPatientNumber)).toBeVisible();

  await page.getByRole('button', { name: 'Start consultation' }).first().click();
  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}/i);
  await expect(page.getByText('Status: UNKNOWN')).toBeVisible();
  await expect(page.getByText(/not the same as no known allergies/i)).toBeVisible();

  await page.locator('textarea').nth(0).fill('E2E synthetic sore throat');
  await page.locator('textarea').nth(1).fill('Started this morning during the browser test.');
  await page.locator('textarea').nth(2).fill('Oropharynx mildly erythematous.');
  await page.locator('textarea').nth(3).fill('Likely viral pharyngitis for synthetic test.');
  await page.locator('textarea').nth(4).fill('Supportive care. Demo tablet only.');
  await page.getByRole('button', { name: 'Save vitals' }).click();
  await expect(page.getByText('Vitals recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await expect(page.locator('textarea').nth(0)).toHaveValue('E2E synthetic sore throat');
  await page.reload();
  await expect(page.locator('textarea').nth(0)).toHaveValue('E2E synthetic sore throat');

  await page.getByRole('button', { name: 'Review & sign' }).click();
  await expect(page.getByText('Consultation signed')).toBeVisible();
  await expect(page.locator('h1', { hasText: 'Consultation' }).locator('xpath=..').getByText('SIGNED', { exact: true })).toBeVisible();
  await expect(page.locator('textarea').nth(0)).toBeDisabled();

  await page.getByLabel('Medicine name').fill('Demo tablet');
  await page.getByLabel('Dose').fill('1 tablet');
  await page.getByLabel('Frequency').fill('Twice daily');
  await page.getByRole('button', { name: 'Save prescription draft' }).click();
  await expect(page.getByText('Prescription DRAFT', { exact: true })).toBeVisible();
  await expect(page.getByText('Prescription status: DRAFT')).toBeVisible();
  await page.getByRole('button', { name: 'Sign prescription' }).click();
  await expect(page.getByText('Prescription SIGNED', { exact: true })).toBeVisible();
  await expect(page.getByText('Prescription status: SIGNED')).toBeVisible();

  const printResponse = page.waitForResponse(
    (response) => response.url().includes('/clinic/prescriptions/') && response.url().includes('/print'),
  );
  await page.getByRole('button', { name: 'Print prescription' }).click();
  const response = await printResponse;
  expect(response.status()).toBe(200);
  const html = (await response.text()).toLowerCase();
  expect(html).toContain('demo tablet');
  expect(html).toContain(credentials.clinicA.seedPatientNumber.toLowerCase());
  expect(html).toContain('status: signed');
  expect(html).not.toMatch(/status:\s*draft/);
  expect(html).not.toContain('class="draft"');
});
