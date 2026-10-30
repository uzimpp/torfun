import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { LinkLine } from '@/components/notifications/link-line';

export const metadata: Metadata = { title: 'เชื่อมต่อ LINE | Torfun', referrer: 'no-referrer' };
export default async function LinkLinePage({
  searchParams,
}: {
  searchParams: Promise<{ link_token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.link_token === 'string' ? params.link_token : '';
  await requireUser(
    token
      ? `/notifications/link-line?${new URLSearchParams({ link_token: token })}`
      : '/notifications',
  );
  return (
    <main className="page-fill mx-auto w-full max-w-xl px-5 py-14 sm:px-8">
      <h1 className="text-2xl font-semibold">เชื่อมต่อ LINE กับ Torfun</h1>
      <LinkLine linkToken={typeof params.link_token === 'string' ? params.link_token : ''} />
    </main>
  );
}
