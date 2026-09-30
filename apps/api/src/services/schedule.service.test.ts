import { describe, expect, test } from 'bun:test';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import { ScheduleService } from './schedule.service';

const NOW = new Date('2026-10-01T05:00:00.000Z'); // 12:00 on 1 Oct in Bangkok
const daily = { enabled: true, mode: 'daily', timeOfDay: '02:00', everyHours: 24 } as const;

function build(now: Date = NOW) {
  const store = new InMemoryScheduleStore();
  const service = new ScheduleService(store, () => now);
  return { store, service };
}

describe('ScheduleService', () => {
  test('starts off, with nothing scheduled and nothing run', async () => {
    const { service } = build();

    expect(await service.get()).toEqual({
      enabled: false,
      mode: 'daily',
      timeOfDay: '02:00',
      everyHours: 24,
      updatedAt: null,
      updatedBy: null,
      lastRunAt: null,
      nextRunAt: null,
    });
  });

  test('enabling it names who did so, and the first run is the next slot — not now', async () => {
    const { service } = build();

    const view = await service.update(daily, 'admin-1');

    expect(view.enabled).toBe(true);
    expect(view.updatedBy).toBe('admin-1');
    expect(view.updatedAt).toBe('2026-10-01T05:00:00.000Z');
    expect(view.nextRunAt).toBe('2026-10-01T19:00:00.000Z');
    expect(view.lastRunAt).toBeNull();
  });

  test('reports when the last run started, and counts the next from it', async () => {
    const { store, service } = build();
    await service.update({ ...daily, mode: 'interval', everyHours: 8 }, 'admin-1');
    await store.markRunStarted('2026-10-01T06:00:00.000Z');

    const view = await service.get();

    expect(view.lastRunAt).toBe('2026-10-01T06:00:00.000Z');
    expect(view.nextRunAt).toBe('2026-10-01T14:00:00.000Z');
  });

  test('turning it off leaves no next run, and keeps the last', async () => {
    const { store, service } = build();
    await service.update(daily, 'admin-1');
    await store.markRunStarted('2026-10-01T06:00:00.000Z');

    const view = await service.update({ ...daily, enabled: false }, 'admin-1');

    expect(view.enabled).toBe(false);
    expect(view.nextRunAt).toBeNull();
    expect(view.lastRunAt).toBe('2026-10-01T06:00:00.000Z');
  });

  test('saving again restarts the count from that moment', async () => {
    const store = new InMemoryScheduleStore();
    await new ScheduleService(store, () => new Date('2026-10-01T05:00:00.000Z')).update(
      daily,
      'admin-1',
    );

    const later = new ScheduleService(store, () => new Date('2026-10-03T22:00:00.000Z'));
    const view = await later.update({ ...daily, timeOfDay: '06:00' }, 'admin-2');

    expect(view.updatedBy).toBe('admin-2');
    // 06:00 Bangkok on 4 Oct is 23:00 UTC on 3 Oct.
    expect(view.nextRunAt).toBe('2026-10-03T23:00:00.000Z');
  });
});
