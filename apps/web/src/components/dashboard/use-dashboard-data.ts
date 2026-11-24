'use client';

import { useEffect, useState } from 'react';
import {
  currentDeadline,
  thailandDay,
  type NotificationResponse,
  type TorListItem,
} from '@torfun/types';
import { ApiError, fetchFavorites, fetchNotifications, fetchProjects } from '@/lib/api';

/** How many of today's new announcements the dashboard shows. */
export const TODAY_LIMIT = 5;
/** How many tracked TORs and status changes the dashboard shows. */
export const TRACKED_LIMIT = 5;

/** One panel's load: its own state, so one failing call never blanks the others. */
export type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T };

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

/** Runs `fetcher` once on mount; a response that arrives after unmount is dropped. */
function useLoad<T>(fetcher: () => Promise<T>, fallback: string): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (value) => {
        if (!cancelled) setLoad({ state: 'ready', value });
      },
      (caught: unknown) => {
        if (!cancelled) setLoad({ state: 'error', message: messageOf(caught, fallback) });
      },
    );
    return () => {
      cancelled = true;
    };
    // The fetchers are module-level and the panel loads once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return load;
}

export interface TodayAnnouncements {
  /** The newest few announced today. */
  items: TorListItem[];
  /** How many were announced today in all, which can exceed what is shown. */
  total: number;
}

/** The TORs announced today (Thai calendar day), newest first. */
export function useTodayAnnouncements(): Load<TodayAnnouncements> {
  return useLoad(async () => {
    const today = thailandDay();
    const page = await fetchProjects({
      publishedFrom: today,
      publishedTo: today,
      order: 'announced',
      limit: TODAY_LIMIT,
      offset: 0,
    });
    return { items: page.items, total: page.total };
  }, 'โหลดประกาศใหม่วันนี้ไม่สำเร็จ');
}

export interface TrackedTor {
  item: TorListItem;
  /** Epoch ms of the bid or comment deadline, or null when none is known. */
  deadlineMs: number | null;
}

export interface TrackedUpdates {
  /** The officer's saved TORs, the soonest-closing open ones first. */
  tracked: TrackedTor[];
  trackedTotal: number;
  /** The latest status or deadline changes on a TOR the officer follows. */
  changes: NotificationResponse[];
}

/** Open and drafting TORs that still have a future deadline come first, soonest first. */
export function orderTracked(tracked: TrackedTor[], now: number): TrackedTor[] {
  const upcoming = (t: TrackedTor) => t.deadlineMs !== null && t.deadlineMs >= now;
  return [...tracked].sort((a, b) => {
    if (upcoming(a) !== upcoming(b)) return upcoming(a) ? -1 : 1;
    if (upcoming(a) && upcoming(b)) return (a.deadlineMs ?? 0) - (b.deadlineMs ?? 0);
    return a.item.projectName.localeCompare(b.item.projectName, 'th');
  });
}

/**
 * What the officer is following: the TORs they saved, and the status or
 * deadline changes the notification feed has recorded on them. Both lists are
 * the signed-in officer's own — there is no company-wide watch list.
 */
export function useTrackedUpdates(): Load<TrackedUpdates> {
  return useLoad(async () => {
    const [favorites, notifications] = await Promise.all([
      fetchFavorites(),
      fetchNotifications('all', 0),
    ]);
    const now = Date.now();
    const tracked = favorites.favorites.map(({ procurement }): TrackedTor => {
      const deadline = currentDeadline(procurement);
      return {
        item: procurement,
        deadlineMs: deadline ? Date.parse(deadline.at) || null : null,
      };
    });
    return {
      tracked: orderTracked(tracked, now).slice(0, TRACKED_LIMIT),
      trackedTotal: tracked.length,
      changes: notifications.items
        .filter((item) => item.event === 'status_changed')
        .slice(0, TRACKED_LIMIT),
    };
  }, 'โหลดความเคลื่อนไหวของ TOR ที่ติดตามไม่สำเร็จ');
}
