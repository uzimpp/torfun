import { describe, expect, test } from 'bun:test';
import type { FastifyBaseLogger } from 'fastify';
import { UnreachableError } from './client';
import { SITE_UNREACHABLE_AFTER } from './constants';
import type { RecordGuard } from './record-work';
import { createRunControl, runEnding, type RunStatus, type StopReason } from './run-control';
import { createSiteGate, SiteClosedError, SiteLatchedError } from './site-gate';

const logger = { info() {}, warn() {} } as unknown as FastifyBaseLogger;

function control(options: { stopRequested?: () => boolean; shouldContinue?: () => boolean } = {}) {
  const gate = createSiteGate({ pause: async () => {} });
  let stops = 0;
  const run = createRunControl({ gate, logger, ...options, onStop: () => (stops += 1) });
  return { run, gate, stops: () => stops };
}

/** Holds the gate, so the next acquirer waits and shows how the gate was shut. */
async function shutWith(gate: ReturnType<typeof createSiteGate>, shut: () => void) {
  const hold = await gate.acquire('fresh');
  const waiting = gate.acquire('fresh');
  shut();
  await hold.release();
  return waiting.then(
    () => null,
    (error: unknown) => error,
  );
}

const guard = (): RecordGuard => ({
  expired: false,
  siteRequest: false,
  controller: new AbortController(),
  siteDown: false,
});

const unanswered = () => Promise.reject(new UnreachableError('no answer'));

describe('runEnding', () => {
  const stopped = (
    reason: StopReason,
    facts: { refused?: boolean; siteDown?: boolean } = {},
  ): RunStatus => ({
    kind: 'stopped',
    reason,
    refused: facts.refused ?? reason === 'refused',
    siteDown: facts.siteDown ?? reason === 'unreachable',
  });
  const swept = { rateLimited: false, unreachable: false };

  test('a Run that ran to the end shows no stop', () => {
    expect(runEnding({ kind: 'running' }, swept)).toEqual({
      aborted: false,
      stopped: null,
      discoveryStopped: null,
    });
  });

  test('each reason shows as the result always showed it', () => {
    expect(runEnding(stopped('refused'), swept)).toEqual({
      aborted: true,
      stopped: null,
      discoveryStopped: null,
    });
    expect(runEnding(stopped('unreachable'), swept)).toEqual({
      aborted: false,
      stopped: null,
      discoveryStopped: 'unreachable',
    });
    expect(runEnding(stopped('admin'), swept)).toEqual({
      aborted: false,
      stopped: 'admin',
      discoveryStopped: null,
    });
    for (const reason of ['lease', 'error'] as const) {
      expect(runEnding(stopped(reason), swept)).toEqual({
        aborted: false,
        stopped: null,
        discoveryStopped: null,
      });
    }
  });

  test('a refusal after an administrator stop shows both', () => {
    expect(runEnding(stopped('admin', { refused: true }), swept)).toEqual({
      aborted: true,
      stopped: 'admin',
      discoveryStopped: null,
    });
  });

  test("a refusal shows as Discovery's only where its sweep was cut short by it", () => {
    expect(runEnding(stopped('refused'), { rateLimited: true, unreachable: false })).toEqual({
      aborted: true,
      stopped: null,
      discoveryStopped: 'rate_limited',
    });
  });

  test("a silent site shows as Discovery's even with no sweep", () => {
    expect(runEnding(stopped('admin', { siteDown: true }), null).discoveryStopped).toBe(
      'unreachable',
    );
  });
});

describe('createRunControl', () => {
  test('a refusal latches the gate; any other stop closes it', async () => {
    const refused = control();
    expect(await shutWith(refused.gate, () => refused.run.halt('refused'))).toBeInstanceOf(
      SiteLatchedError,
    );

    const unreachable = control();
    const closed = await shutWith(unreachable.gate, () => unreachable.run.halt('unreachable'));
    expect(closed).toBeInstanceOf(SiteClosedError);
    expect((closed as SiteClosedError).reason).toBe('unreachable');

    const admin = control();
    const stopped = await shutWith(admin.gate, () => admin.run.halt('admin'));
    expect((stopped as SiteClosedError).reason).toBe('stopped');
  });

  test('keeps the first reason, wakes once, and still notes a later refusal', () => {
    const { run, stops } = control();
    run.halt('admin');
    run.halt('error');
    run.halt('refused');
    expect(run.status).toEqual({
      kind: 'stopped',
      reason: 'admin',
      refused: true,
      siteDown: false,
    });
    expect(stops()).toBe(1);
  });

  test("mayGoOn notices an administrator's stop, then a lost lease", () => {
    let stop = false;
    let lease = true;
    const admin = control({ stopRequested: () => stop, shouldContinue: () => lease });
    expect(admin.run.mayGoOn()).toBe(true);
    stop = true;
    lease = false;
    expect(admin.run.mayGoOn()).toBe(false);
    expect(admin.run.status).toMatchObject({ reason: 'admin' });

    const lost = control({ shouldContinue: () => false });
    expect(lost.run.mayGoOn()).toBe(false);
    expect(lost.run.status).toMatchObject({ reason: 'lease' });
  });

  test('stops for a silent site after the streak, and marks the records that met it', async () => {
    const { run } = control();
    for (let i = 1; i < SITE_UNREACHABLE_AFTER; i++) {
      await run.askSite(unanswered).catch(() => {});
    }
    expect(run.status.kind).toBe('running');

    const record = guard();
    await expect(run.askSite(unanswered, record)).rejects.toBeInstanceOf(UnreachableError);
    expect(run.status).toEqual({
      kind: 'stopped',
      reason: 'unreachable',
      refused: false,
      siteDown: true,
    });
    expect(record.siteDown).toBe(true);
  });

  test('any answer, an error included, resets the streak', async () => {
    const { run } = control();
    for (let i = 1; i < SITE_UNREACHABLE_AFTER; i++) {
      await run.askSite(unanswered).catch(() => {});
    }
    await run.askSite(() => Promise.reject(new Error('HTTP 500'))).catch(() => {});
    await run.askSite(unanswered).catch(() => {});
    expect(run.status.kind).toBe('running');
  });

  test('a request cancelled by its deadline counts as unanswered', async () => {
    const { run } = control();
    const late = { ...guard(), expired: true };
    for (let i = 0; i < SITE_UNREACHABLE_AFTER; i++) {
      await run.askSite(() => Promise.reject(new Error('aborted')), late).catch(() => {});
    }
    expect(run.status).toMatchObject({ reason: 'unreachable', siteDown: true });
  });
});
