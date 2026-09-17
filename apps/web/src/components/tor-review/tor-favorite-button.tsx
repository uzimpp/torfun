'use client';

import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addFavorite, checkFavorited, removeFavorite, ApiError } from '@/lib/api';

export function TorFavoriteButton({ projectId }: { projectId: string }) {
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    checkFavorited(projectId).then(
      (response) => {
        if (cancelled) return;
        setFavorited(response.favorited);
        setLoading(false);
      },
      () => {
        // A failed check should not block the button — it starts unfavorited
        // and the officer can still try to save it.
        if (cancelled) return;
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      if (favorited) {
        await removeFavorite(projectId);
        setFavorited(false);
      } else {
        await addFavorite(projectId);
        setFavorited(true);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'บันทึก TOR ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || saving;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full min-w-0"
        aria-label={favorited ? 'นำ TOR นี้ออกจากรายการที่บันทึกไว้' : 'บันทึก TOR นี้'}
        aria-pressed={favorited}
        onClick={toggle}
        disabled={busy}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : favorited ? (
          <BookmarkCheck aria-hidden="true" />
        ) : (
          <Bookmark aria-hidden="true" />
        )}
        {favorited ? 'บันทึกแล้ว' : 'บันทึก TOR'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
