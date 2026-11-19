import { expect, test } from '@playwright/test';

test('clinic login page renders without exposing a session', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Clinic login' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('patient');
  expect(body.toLowerCase()).not.toContain('invoice');
});
