import { expect, test } from '@playwright/test';
test('guest login navigation and skip link work without workspace links', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ข้ามไปยังเนื้อหา' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-content')).toBeFocused();
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'แดชบอร์ด' })).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'หน้าแรก', exact: true })).toHaveCount(0);
  await header.getByRole('link', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeVisible();
  // The sign-in page sits in FlowShell, which has no navbar — its brand link is
  // the only way back, and it names its destination.
  await page.getByRole('link', { name: 'Torfun หน้าแรก', exact: true }).click();
  await expect(page).toHaveURL('/');
});
test('mobile guest toolbar exposes clearly unavailable future controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /เปลี่ยนภาษา/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /สลับโหมด/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /การแจ้งเตือน/ })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('theme selection survives navigation and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'สลับโหมดกลางคืน' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('banner').getByRole('link', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'สลับโหมดกลางวัน' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
