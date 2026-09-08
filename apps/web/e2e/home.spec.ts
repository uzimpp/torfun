import { expect, test } from '@playwright/test';
for (const width of [320, 375, 768, 1280]) {
  test(`landing is readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ค้นหาโอกาสจาก TOR');
    await expect(page.locator('html')).toHaveAttribute('lang', 'th');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('landing.png'), fullPage: true });
    await page.getByRole('link', { name: 'สร้างบัญชีผู้ใช้', exact: true }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'สร้างบัญชีผู้ใช้' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
