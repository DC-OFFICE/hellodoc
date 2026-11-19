import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

/**
 * Reception workflow verified with the clinic manager account.
 * This is manager-tested, not a dedicated receptionist-role pass.
 */
test.use({ storageState: join(process.cwd(), 'e2e', '.auth', 'manager-a.json') });

test('manager reception: register patient, book, check in, operate queue', async ({ page }) => {
  test.setTimeout(180_000);
  const credentials = loadCredentials();
  const digitId = credentials.runId.replace(/\D/g, '').padEnd(5, '0').slice(0, 5);
  const phone = `077${digitId}01`;
  const sharedPhone = `077${digitId}02`;
  const patientOne = `E2E Mgr Patient One ${credentials.runId}`;
  const patientTwo = `E2E Mgr Patient Two ${credentials.runId}`;

  await page.goto('/patients');
  await expect(page.getByText(credentials.clinicA.clinicName).first()).toBeVisible();
  await page.getByRole('link', { name: /Register Patient/i }).click();
  await expect(page).toHaveURL(/\/patients\/new/);

  await page.getByLabel('Full name').fill(patientOne);
  await page.getByLabel('Primary phone').fill(phone);
  await page.getByRole('button', { name: 'Review & continue' }).click();
  await page.getByRole('button', { name: 'Register Patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/i);
  const patientOneId = page.url().split('/').pop()!;
  const patientNumber = (await page.locator('p.font-mono').first().textContent())?.trim() ?? '';
  expect(patientNumber).toMatch(/^PAT-\d+$/);
  await expect(page.locator('p.font-mono').first()).toHaveText(patientNumber);

  await page.getByRole('link', { name: 'Edit Patient' }).click();
  await expect(page.getByRole('heading', { name: 'Edit patient' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue(patientOne);
  await page.getByLabel('Preferred name').fill('One Preferred');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole('heading', { name: 'One Preferred' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'One Preferred' })).toBeVisible();

  await page.goto('/patients/new');
  await page.getByLabel('Full name').fill(patientTwo);
  await page.getByLabel('Primary phone').fill(sharedPhone);
  await page.getByRole('button', { name: 'Review & continue' }).click();
  await page.getByRole('button', { name: 'Register Patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/i);

  await page.goto('/patients/new');
  await page.getByLabel('Full name').fill(`E2E Shared Phone ${credentials.runId}`);
  await page.getByLabel('Primary phone').fill(sharedPhone);
  await page.getByRole('button', { name: 'Review & continue' }).click();
  await expect(page.getByText('Shared phone number', { exact: false }).first()).toBeVisible();
  await page.getByLabel(/different person sharing the same phone/i).check();
  await page.getByRole('button', { name: 'Register Patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/i);

  await page.goto(`/appointments/new?patientId=${patientOneId}`);
  await expect(page.getByRole('heading', { name: 'Book appointment' })).toBeVisible();
  await expect(page.getByText(new RegExp(`${patientOne}|${patientNumber}`))).toBeVisible({ timeout: 15_000 });
  const doctorSelect = page.locator('select').nth(0);
  await doctorSelect.selectOption({ index: 1 });
  const sessionSelect = page.locator('select').nth(1);
  await expect.poll(async () => sessionSelect.locator('option').count(), { timeout: 20_000 }).toBeGreaterThan(1);
  await sessionSelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm Appointment' }).click();
  await expect(page.getByRole('heading', { name: 'Appointment confirmed' })).toBeVisible();
  const queueText = (await page.locator('p.text-4xl').textContent())?.trim() ?? '';
  expect(queueText).toMatch(/#\d+/);
  await expect(page.getByText(/Booking ref:/i)).toBeVisible();
  await page.getByRole('link', { name: 'View appointment' }).click();
  await expect(page).toHaveURL(/\/appointments\/[0-9a-f-]{36}/i);
  await page.reload();
  await expect(page.getByText(/Queue #/i)).toBeVisible();

  await page.goto(`/sessions/${credentials.clinicA.bookingSessionId}/queue`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const openSession = page.getByRole('button', { name: 'Open session' });
  if (await openSession.isVisible()) {
    const opened = page.waitForResponse(
      (response) => response.url().includes('/open') && response.request().method() === 'POST',
    );
    await openSession.click();
    const openResponse = await opened;
    expect(openResponse.ok(), `Open session failed: ${openResponse.status()}`).toBeTruthy();
  }
  await expect(page.getByText('status OPEN')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Check in' }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Check in' }).first().click();
  await expect(page.getByRole('button', { name: 'Call Next' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Call Next' }).click();
  await expect(page.getByRole('button', { name: 'Start turn' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Start turn' }).click();
  await page.getByRole('button', { name: 'Finish turn' }).click();
  await expect(page.getByText(queueText.replace('#', ''), { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
});