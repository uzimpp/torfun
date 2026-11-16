'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchFavorites, removeFavorite, type FavoriteResponse } from '@/lib/api';

/**
 * One favorited TOR, as this page needs it. Derived from the embedded
 * `Procurement` the API sends back with each favorite, the same way
 * `use-tor-review-data.ts` derives its shape from a `Procurement` — a field
 * missing here (no analysis yet, no announced budget) is `null`, not a
 * fabricated placeholder.
 */
export type FavoritedTor = {
  projectId: string;
  title: string;
  agency: string;
  submissionDeadline: string | null;
  technologyStack: string[];
  summary: string | null;
  budget: number | null;
};

export interface FavoritedData {
  tors: FavoritedTor[];
  loading: boolean;
  error: string | null;
  /** The project currently being unfavorited, so only its card shows a pending state. */
  removingId: string | null;
  remove: (projectId: string) => Promise<void>;
}

function toFavoritedTor({ procurement }: FavoriteResponse): FavoritedTor {
  return {
    projectId: procurement.projectId,
    title: procurement.projectName,
    agency: procurement.deptName,
    submissionDeadline: procurement.analysis?.deadlineAt ?? null,
    technologyStack: procurement.analysis?.techStack ?? [],
    summary: procurement.analysis?.summary ?? null,
    budget: procurement.projectMoney,
  };
}

export function useFavoritedData(): FavoritedData {
  const [tors, setTors] = useState<FavoritedTor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    // Guards against an out-of-order response overwriting a later one.
    let cancelled = false;

    fetchFavorites().then(
      (response) => {
        if (cancelled) return;
        setTors(response.favorites.map(toFavoritedTor));
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : 'โหลดรายการ TOR ที่บันทึกไว้ไม่สำเร็จ',
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const remove = useCallback(async (projectId: string) => {
    setRemovingId(projectId);
    try {
      await removeFavorite(projectId);
      setTors((current) => current.filter((tor) => tor.projectId !== projectId));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'นำ TOR ออกจากรายการที่บันทึกไว้ไม่สำเร็จ',
      );
    } finally {
      setRemovingId(null);
    }
  }, []);

  return { tors, loading, error, removingId, remove };
}
