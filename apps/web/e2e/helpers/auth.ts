import { expect, type Page } from '@playwright/test';
import type { E2ERole } from './credentials';

export async function loginAs(page: Page, account: E2ERole, expectedPath: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (await page.getByLabel('Authentication code').isVisible().catch(() => false)) {
    throw new Error(
      `MFA challenge appeared for ${account.role}. Local E2E expects MFA_REQUIRED=false; do not bypass MFA.`,
    );
  }
  const loginError = page.getByText(/Login failed|Invalid email or password/i);
  if (await loginError.isVisible().catch(() => false)) {
    throw new Error(`Login failed for ${account.email}: ${await loginError.textContent()}`);
  }
  await expect(page).toHaveURL(new RegExp(expectedPath.replace(/\//g, '\\/')));
}

export async function logoutClinic(page: Page) {
  await page.locator('[data-sidebar="footer"]').getByRole('button').first().click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
}
