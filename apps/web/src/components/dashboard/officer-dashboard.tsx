'use client';

import { TodayPanel, TrackedPanel } from './dashboard-sections';
import { useTodayAnnouncements, useTrackedUpdates } from './use-dashboard-data';

/**
 * What a Business Development Officer sees on landing: what e-GP announced
 * today, and what has moved on the TORs they follow. Each panel loads on its
 * own, so a slow or failing call leaves the other one readable.
 */
export function OfficerDashboard() {
  const today = useTodayAnnouncements();
  const tracked = useTrackedUpdates();

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      <TodayPanel load={today} />
      <TrackedPanel load={tracked} />
    </div>
  );
}
