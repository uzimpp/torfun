import type { FastifyBaseLogger } from 'fastify';
import { ConflictError } from '../core/errors';
import type { ScheduleStore } from '../repositories/schedule.repository';
import { isDue } from './schedule';
import type { StartRunInput } from './ingestion.service';

/**
 * What one look at the clock came to.
 *  - `started`  a Run was due and has begun
 *  - `not-due`  nothing to do (the usual answer, including "schedule is off")
 *  - `busy`     due, but a Run is already going elsewhere; it stays due
 *  - `failed`   due, but starting it went wrong; logged, and tried again next tick
 */
export type TickOutcome = 'started' | 'not-due' | 'busy' | 'failed';

const DEFAULT_TICK_MS = 60_000;

/**
 * Starts a Run when the Schedule says one is due.
 *
 * It is a clock-watcher and nothing more. It never decides whether a Run may
 * happen — that is the lease's job, in `IngestionService.startRun`, which a
 * scheduled start goes through exactly as a manual one does — so a scheduler in
 * two processes, or a tick racing an administrator's click, still yields one Run.
 * Being due is not consumed by losing that race: the last Run's start is only
 * recorded by a Run that began, so a `busy` tick is due again on the next one.
 */
export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly schedules: Pick<ScheduleStore, 'get'>,
    private readonly startRun: (input: StartRunInput) => Promise<void>,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async tick(now: Date = new Date()): Promise<TickOutcome> {
    // Ticks are a minute apart and cheap, but a slow Mongo must not stack them.
    if (this.ticking) return 'busy';
    this.ticking = true;

    try {
      const { schedule, lastRunStartedAt } = await this.schedules.get();
      if (!isDue(schedule, lastRunStartedAt, now)) return 'not-due';

      // Exactly what an administrator's button starts. A Schedule changes
      // when a Run starts, never what it does.
      await this.startRun({ trigger: 'scheduled' });
      this.logger.info('egp: scheduled ingestion run started');
      return 'started';
    } catch (error) {
      if (error instanceof ConflictError) return 'busy';
      this.logger.error({ err: error }, 'egp: scheduled ingestion run could not start');
      return 'failed';
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Begin ticking. Called from `server.ts`, not from `buildApp()`, so a test
   * that builds an app never has a timer running behind it. The timer is
   * unref'd: it must never be the reason a process stays alive.
   */
  start(intervalMs: number = DEFAULT_TICK_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
