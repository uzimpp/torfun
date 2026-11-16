import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { FavoritedPage } from '@/components/favorited/favorited-page';

export const metadata: Metadata = {
  title: 'TOR ที่บันทึกไว้ | TOR Finder',
  description: 'รายการประกาศ TOR ที่บันทึกไว้',
};

export default async function FavoritedRoute() {
  await requireUser();
  return <FavoritedPage />;
}
