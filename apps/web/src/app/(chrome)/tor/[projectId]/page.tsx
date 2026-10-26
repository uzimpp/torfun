import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { TorReviewContent } from '@/components/tor-review/tor-review-content';

export const metadata: Metadata = {
  title: 'รายละเอียด TOR | Torfun',
  description: 'รายละเอียดประกาศ TOR และการประเมินความเหมาะสมเบื้องต้น',
};

export default async function TorReviewRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireUser(`/tor/${encodeURIComponent(projectId)}`);

  return <TorReviewContent projectId={projectId} />;
}
