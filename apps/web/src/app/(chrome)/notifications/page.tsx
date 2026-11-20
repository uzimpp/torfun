import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Inbox } from '@/components/notifications/inbox';

export const metadata: Metadata = { title: 'การแจ้งเตือน | Torfun', referrer: 'no-referrer' };
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ verify_email?: string }>;
}) {
  const params = await searchParams;
  const returnTo =
    typeof params.verify_email === 'string'
      ? `/notifications?${new URLSearchParams({ verify_email: params.verify_email })}`
      : '/notifications';
  const user = await requireUser(returnTo);
  if (user.role === 'admin') redirect('/admin/notifications');
  return (
    <Inbox
      verificationToken={typeof params.verify_email === 'string' ? params.verify_email : undefined}
    />
  );
}
