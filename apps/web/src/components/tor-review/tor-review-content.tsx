'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TorReviewPage } from './tor-review-page';
import { useTorReviewData } from './use-tor-review-data';

export function TorReviewContent({ projectId }: { projectId: string }) {
  const { data, loading, notFound, error } = useTorReviewData(projectId);

  if (loading) {
    return <ReviewState title="กำลังโหลดข้อมูล TOR" />;
  }

  if (notFound) {
    return <ReviewState title="ไม่พบประกาศ TOR นี้" />;
  }

  if (error || !data) {
    return <ReviewState title={error ?? 'โหลดข้อมูล TOR ไม่สำเร็จ'} retry />;
  }

  return <TorReviewPage tor={data} />;
}

function ReviewState({ title, retry = false }: { title: string; retry?: boolean }) {
  return (
    <main className="page-fill mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
      <AlertCircle aria-hidden="true" className="text-destructive size-8" />
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      {retry && (
        <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
          ลองใหม่
        </Button>
      )}
    </main>
  );
}
