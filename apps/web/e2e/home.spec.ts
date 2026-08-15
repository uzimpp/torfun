import { expect, test } from '@playwright/test';

test('home page loads and shows the Thai heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('ระบบค้นหาประกาศ TOR')).toBeVisible();
});
