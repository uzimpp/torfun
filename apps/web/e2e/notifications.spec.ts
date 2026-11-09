import { expect, test } from '@playwright/test';

test('a signed-out visitor keeps the LINE linking destination through sign-in', async ({
  page,
}) => {
  const destination = '/notifications/link-line?link_token=return-navigation-test';
  await page.goto(destination);
  await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับสู่ Torfun' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe(destination);
});

test('a signed-out visitor keeps the email verification destination through sign-in', async ({
  page,
}) => {
  const destination = `/notifications?verify_email=${'x'.repeat(43)}`;
  await page.goto(destination);
  await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับสู่ Torfun' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe(destination);
});
