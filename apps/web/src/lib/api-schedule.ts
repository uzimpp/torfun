import type { ScheduleUpdate, ScheduleView } from '@torfun/types';
import { ApiError, apiFetch } from './api';

/**
 * The schedule endpoints, over the same session-renewing `apiFetch` the rest of
 * the console uses. Their own file so the schedule can be built and changed
 * without touching `api.ts`, which the session handling lives in.
 */

async function scheduleRequest(init?: RequestInit): Promise<ScheduleView> {
  const response = await apiFetch('/api/ingestion/schedule', init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
  }
  return (await response.json()) as ScheduleView;
}

export function fetchSchedule(): Promise<ScheduleView> {
  return scheduleRequest();
}

export function updateSchedule(update: ScheduleUpdate): Promise<ScheduleView> {
  return scheduleRequest({ method: 'PUT', body: JSON.stringify(update) });
}
