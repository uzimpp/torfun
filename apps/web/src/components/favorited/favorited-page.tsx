'use client';

import { AlertCircle, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoritedCard } from './favorited-card';
import { useFavoritedData } from './use-favorited-data';

export function FavoritedPage() {
  const { tors, loading, error, removingId, remove } = useFavoritedData();

  return (
    <main className="page-fill mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-primary flex items-center gap-2 text-sm font-medium">
            <BookmarkCheck aria-hidden="true" className="size-4" />
            รายการที่บันทึกไว้
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">TOR ที่บันทึกไว้</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
            รวมประกาศ TOR ที่คุณสนใจไว้สำหรับกลับมาพิจารณาในภายหลัง
          </p>
        </div>
        {!loading && !error && (
          <p className="text-muted-foreground text-sm">{tors.length} รายการที่บันทึกไว้</p>
        )}
      </header>

      {loading && (
        <p className="text-muted-foreground mt-10 text-sm">กำลังโหลดรายการที่บันทึกไว้...</p>
      )}

      {!loading && error && (
        <div className="border-destructive/30 bg-destructive/5 mt-10 flex flex-col items-start gap-3 rounded-xl border p-6">
          <p className="text-destructive flex items-center gap-2 text-sm">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
            ลองใหม่
          </Button>
        </div>
      )}

      {!loading && !error && tors.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          ยังไม่มีประกาศ TOR ที่บันทึกไว้ กดบันทึก TOR จากหน้ารายละเอียดเพื่อเก็บไว้ที่นี่
        </p>
      )}

      {!loading && !error && tors.length > 0 && (
        <section
          aria-label="รายการ TOR ที่บันทึกไว้"
          className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {tors.map((tor) => (
            <FavoritedCard
              key={tor.projectId}
              tor={tor}
              removing={removingId === tor.projectId}
              onRemove={() => remove(tor.projectId)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
