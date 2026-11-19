import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { loadCredentials } from './helpers/credentials';

test.describe('role and tenant isolation', () => {
  test('cashier cannot open clinical records or billing settings write', async ({ browser }) => {
    const credentials = loadCredentials();
    const context = await browser.newContext({
      storageState: join(process.cwd(), 'e2e', '.auth', 'cashier-a.json'),
    });
    const page = await context.newPage();
    await page.goto('/doctor/worklist');
    const clinical = await page.evaluate(async () => {
      const apiBase = 'http://localhost:4000/api';
      const res = await fetch(`${apiBase}/doctor/worklist`, { credentials: 'include' });
      return res.status;
    });
    expect([401, 403]).toContain(clinical);

    const settings = await page.evaluate(async () => {
      const csrf = await fetch('http://localhost:4000/api/csrf', { credentials: 'include' }).then((r) => r.json());
      const res = await fetch('http://localhost:4000/api/clinic/billing/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({ displayName: 'nope' }),
      });
      return res.status;
    });
    expect([401, 403]).toContain(settings);
    await context.close();
  });

  test('manager A cannot read clinic B patient or invoice APIs', async ({ browser }) => {
    const credentials = loadCredentials();
    const context = await browser.newContext({
      storageState: join(process.cwd(), 'e2e', '.auth', 'manager-a.json'),
    });
    const page = await context.newPage();

    await page.goto('/patients');
    await expect(page.getByText(credentials.clinicA.clinicName).first()).toBeVisible();
    const result = await page.evaluate(
      async ({ patientId, appointmentId }) => {
        const apiBase = 'http://localhost:4000/api';
        const patient = await fetch(`${apiBase}/clinic/patients/${patientId}`, { credentials: 'include' });
        const appointment = await fetch(`${apiBase}/clinic/appointments/${appointmentId}`, {
          credentials: 'include',
        });
        return { patient: patient.status, appointment: appointment.status, patientOk: patient.ok };
      },
      {
        patientId: credentials.clinicB.seedPatientId,
        appointmentId: credentials.clinicB.seedAppointmentId,
      },
    );

    expect(result.patientOk).toBeFalsy();
    expect([403, 404]).toContain(result.patient);
    expect([403, 404]).toContain(result.appointment);
    await context.close();
  });

  test('unauthenticated users cannot open clinic dashboard routes', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/billing/invoices');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/doctor/worklist');
    await expect(page).toHaveURL(/\/login/);
  });

  test('receptionist cannot open billing or clinical write surfaces', async ({ browser }) => {
    const credentials = loadCredentials();
    const context = await browser.newContext({
      storageState: join(process.cwd(), 'e2e', '.auth', 'receptionist-a.json'),
    });
    const page = await context.newPage();
    await page.goto('/patients');
    await expect(page.getByRole('link', { name: 'Patients' })).toBeVisible();

    const invoice = await page.evaluate(async () => {
      const res = await fetch('http://localhost:4000/api/clinic/invoices?limit=5', { credentials: 'include' });
      return res.status;
    });
    expect([401, 403]).toContain(invoice);

    const sign = await page.evaluate(async () => {
      const csrf = await fetch('http://localhost:4000/api/csrf', { credentials: 'include' }).then((r) => r.json());
      const res = await fetch('http://localhost:4000/api/clinic/encounters', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({ appointmentId: '00000000-0000-4000-8000-000000000000' }),
      });
      return res.status;
    });
    expect([401, 403]).toContain(sign);
    await context.close();
  });
});
