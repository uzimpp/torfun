import { expect, test } from '@playwright/test';

test('home page loads recommended TORs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'หน้าหลัก' })).toBeVisible();
  await expect(page.getByText('TOR แนะนำ')).toBeVisible();
});
