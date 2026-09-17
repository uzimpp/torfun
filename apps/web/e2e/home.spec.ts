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

    // Scoped to the page body: the header carries its own registration link,
    // and below `sm` that one is deliberately folded into the menu instead.
    await page.getByRole('main').getByRole('link', { name: 'สร้างบัญชีผู้ใช้' }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'สร้างบัญชีผู้ใช้' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test('the hero search field carries the query to the results page', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByRole('main').getByRole('search', { name: 'ค้นหาประกาศ TOR' });
  await hero.getByRole('searchbox').fill('ระบบสารสนเทศ');
  await hero.getByRole('button', { name: 'ค้นหา' }).click();

  await expect(page).toHaveURL(/\/search\?q=/);
  // The results page reads the query back out of the URL, so what a person
  // typed is still in the box after the navigation.
  await expect(page.getByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toHaveValue(
    'ระบบสารสนเทศ',
  );
  await expect(page.getByRole('region', { name: 'ผลการค้นหา' })).toBeVisible();
});

test('an empty search navigates to the results page rather than being blocked', async ({
  page,
}) => {
  await page.goto('/');
  // Before hydration the field is a plain GET form and submitting it navigates,
  // which is the right fallback but not what this test is about.
  await page.waitForLoadState('networkidle');
  await page.getByRole('main').getByRole('button', { name: 'ค้นหา' }).click();
  // No `q` at all — an empty search lists everything the index holds rather
  // than asking for a term first, so there is nothing to put in the URL.
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('region', { name: 'ผลการค้นหา' })).toBeVisible();
});
