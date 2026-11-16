import { describe, expect, test } from 'bun:test';
import type { Procurement } from '@torfun/types';
import { createLimiter } from './concurrency';
import { createRetrievalQueue, type Candidate } from './retrieval-queue';

const record = (projectId: string) => ({ projectId }) as Procurement;
const fresh = (id: string): Candidate => ({ record: record(id), fresh: true });
const refresh = (id: string): Candidate => ({ record: record(id), fresh: false });

function queue(places: number) {
  const room = createLimiter(places);
  let changes = 0;
  const q = createRetrievalQueue({ room, onChange: () => (changes += 1) });
  return { q, room, changes: () => changes };
}

const ids = (picked: ReturnType<ReturnType<typeof queue>['q']['pick']>) =>
  picked?.candidate.record.projectId;

describe('createRetrievalQueue', () => {
  test('never-read projects go before refreshes, each with a place', () => {
    const { q } = queue(2);
    q.enqueue(refresh('r1'));
    q.enqueue(fresh('f1'));
    const first = q.pick();
    expect(ids(first)).toBe('f1');
    expect(first?.place).toBeFunction();
    const second = q.pick();
    expect(ids(second)).toBe('r1');
    expect(second?.place).toBeUndefined();
    expect(q.pick()).toBeNull();
  });

  test('a project is queued once, however many ways it is found', () => {
    const { q, changes } = queue(2);
    q.enqueue(fresh('a'));
    q.enqueue(fresh('a'));
    q.enqueue(refresh('a'));
    expect(q.length).toBe(1);
    expect(changes()).toBe(1);
  });

  test('with the room full, refreshes are still served and fresh work waits', () => {
    const { q, room } = queue(1);
    const held = room.tryAcquire()!;
    q.enqueue(fresh('f1'));
    q.enqueue(refresh('r1'));
    expect(ids(q.pick())).toBe('r1');
    expect(q.pick()).toBeNull();
    held();
    expect(ids(q.pick())).toBe('f1');
  });

  test('a refresh put back takes a place before its next turn', () => {
    const { q, room } = queue(1);
    const held = room.tryAcquire()!;
    q.putBack({ record: record('r1'), fresh: false, withPlace: true });
    expect(q.pick()).toBeNull();
    held();
    const picked = q.pick();
    expect(ids(picked)).toBe('r1');
    expect(picked?.place).toBeFunction();
    expect(room.tryAcquire()).toBeNull();
  });

  test('giving a place back wakes Retrieval', async () => {
    const { q } = queue(1);
    const place = q.takePlace()!;
    let woken = false;
    const waiting = q.waitForWork().then(() => (woken = true));
    place();
    await waiting;
    expect(woken).toBe(true);
  });

  test('new work and the end of Discovery each wake Retrieval', async () => {
    const { q } = queue(1);
    const forWork = q.waitForWork();
    q.enqueue(fresh('a'));
    await forWork;

    const forEnd = q.waitForWork();
    q.endDiscovery();
    await forEnd;
  });

  test('is drained only once Discovery is done and nothing is left', () => {
    const { q } = queue(1);
    expect(q.drained).toBe(false);
    q.endDiscovery();
    expect(q.drained).toBe(true);
    q.enqueue(refresh('r1'));
    expect(q.drained).toBe(false);
  });

  test('shows no count until it is first built', () => {
    const { q } = queue(1);
    q.enqueue(fresh('a'));
    expect(q.remaining).toBeNull();
    q.built();
    expect(q.remaining).toBe(1);
  });
});
