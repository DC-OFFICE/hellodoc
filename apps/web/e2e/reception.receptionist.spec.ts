import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

/**
 * Dedicated clinic_receptionist browser UAT.
 * Do not treat manager reception tests as coverage for this role.
 */
test.use({ storageState: join(process.cwd(), 'e2e', '.auth', 'receptionist-a.json') });

test('receptionist: register patient, book, check in, operate queue', async ({ page }) => {
  test.setTimeout(180_000);
  const credentials = loadCredentials();
  const digitId = credentials.runId.replace(/\D/g, '').padEnd(5, '0').slice(0, 5);
  const phone = `076${digitId}01`;
  const patientName = `E2E Receptionist Patient ${credentials.runId}`;

  await page.goto('/patients');
  await expect(page.getByText(credentials.clinicA.clinicName).first()).toBeVisible();
  await page.getByRole('link', { name: /Register Patient/i }).click();
  await page.getByLabel('Full name').fill(patientName);
  await page.getByLabel('Primary phone').fill(phone);
  await page.getByRole('button', { name: 'Review & continue' }).click();
  await page.getByRole('button', { name: 'Register Patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/i);
  const patientId = page.url().split('/').pop()!;
  const patientNumber = (await page.locator('p.font-mono').first().textContent())?.trim() ?? '';
  expect(patientNumber).toMatch(/^PAT-\d+$/);

  await page.goto(`/appointments/new?patientId=${patientId}`);
  await expect(page.getByRole('heading', { name: 'Book appointment' })).toBeVisible();
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

  const sessionId = credentials.clinicA.bookingSessionId;
  await page.goto(`/sessions/${sessionId}/queue`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Open via the real authenticated browser session so UI/API ACL both apply.
  const openResult = await page.evaluate(async (id) => {
    const csrf = await fetch('http://localhost:4000/api/csrf', { credentials: 'include' }).then((r) =>
      r.json(),
    );
    const res = await fetch(`http://localhost:4000/api/clinic/sessions/${id}/open`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.csrfToken },
      body: '{}',
    });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 400) };
  }, sessionId);
  expect(openResult.status, `Open session failed: ${openResult.status} ${openResult.text}`).toBeLessThan(400);

  await page.reload();
  await expect(page.getByText(/status\s+OPEN/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Check in' }).first().click();
  await expect(page.getByRole('button', { name: 'Call Next' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Call Next' }).click();
  await expect(page.getByRole('button', { name: 'Start turn' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Start turn' }).click();
  await page.getByRole('button', { name: 'Finish turn' }).click();
  await expect(page.getByText(queueText.replace('#', ''), { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });

  const invoiceDenied = await page.evaluate(async () => {
    const res = await fetch('http://localhost:4000/api/clinic/invoices?limit=5', { credentials: 'include' });
    return res.status;
  });
  expect([401, 403]).toContain(invoiceDenied);

  const clinicalDenied = await page.evaluate(async () => {
    const csrf = await fetch('http://localhost:4000/api/csrf', { credentials: 'include' }).then((r) => r.json());
    const res = await fetch('http://localhost:4000/api/clinic/encounters', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.csrfToken },
      body: JSON.stringify({ appointmentId: '00000000-0000-4000-8000-000000000000' }),
    });
    return res.status;
  });
  expect([401, 403]).toContain(clinicalDenied);
});
