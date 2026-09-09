import { expect, test } from '@playwright/test';

test('guest login navigation and skip link work without workspace links', async ({ page }) => {
  await page.goto('/');
  // Tab pressed before the page settles lands on the document body rather than
  // the first link, which says nothing about the skip link itself.
  await page.waitForLoadState('networkidle');
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

test('the narrow header keeps only what a guest needs on every visit', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: /เปลี่ยนภาษา/ })).toHaveCount(0);
  await expect(header.getByRole('button', { name: /การแจ้งเตือน/ })).toHaveCount(0);
  // The light/dark control moved to the footer; the header must not keep one too.
  await expect(header.getByRole('button', { name: /สลับโหมด/ })).toHaveCount(0);
  await expect(
    page.getByRole('contentinfo').getByRole('button', { name: /สลับโหมด/ }),
  ).toBeEnabled();
  await expect(header.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the mobile menu offers registration that the narrow header leaves out', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('link', { name: 'สร้างบัญชีผู้ใช้' })).toBeVisible();
  await menu.getByRole('link', { name: 'ขั้นตอนการทำงาน' }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#workflow$/);
});

test('the header retracts on the way down and returns on the way up', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('banner');
  await expect(header).toHaveAttribute('data-hidden', 'false');

  await page.mouse.wheel(0, 1400);
  await expect(header).toHaveAttribute('data-hidden', 'true');

  await page.mouse.wheel(0, -400);
  await expect(header).toHaveAttribute('data-hidden', 'false');

  // Back at the top it must be open regardless of the last scroll direction.
  await page.mouse.wheel(0, -4000);
  await expect(header).toHaveAttribute('data-hidden', 'false');
});

test('theme selection survives navigation and reload', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: 'สลับโหมดกลางคืน' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  // The sign-in flow has no footer, so it is the case that proves the choice
  // travels in the cookie rather than in the control.
  await page.getByRole('banner').getByRole('link', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await footer.getByRole('button', { name: 'สลับโหมดกลางวัน' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('an unknown URL gets a 404 that offers a way on', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ไม่พบหน้าที่ต้องการ');
  // One search field, in the page. The header suppresses its own here.
  await expect(page.getByRole('search', { name: 'ค้นหาประกาศ TOR' })).toHaveCount(1);
  await page.getByRole('link', { name: 'กลับหน้าแรก' }).click();
  await expect(page).toHaveURL('/');
});
