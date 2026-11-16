import type { IngestionFailure } from '@torfun/types';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import type { AnalysisTasks } from './analysis-task';
import { RETRIEVAL_SLOT, type LiveView } from './live-view';
import { withDeadline, type Handoff, type RecordGuard, type RecordWork } from './record-work';
import type { Candidate, RetrievalQueue } from './retrieval-queue';
import { takeTurn, type RetrievalDeps } from './retrieval-turn';
import type { RunControl } from './run-control';
import type { RunLedger } from './run-ledger';
import type { SiteGate, SiteGateHold } from './site-gate';

/**
 * Retrieval's one worker: it takes one project at a time from the queue, gives
 * it its turn at the gate, and hands what it fetched to Analysis before going
 * straight on to the next.
 */
export interface RetrievalWorker {
  /** Work the queue until it is drained or the Run stops. Throws only if the store does. */
  run(): Promise<void>;
  /** Gate turns taken, by kind, for the Run's timing log. */
  readonly turns: { retrievalTurns: number; refreshTurns: number };
}

export function createRetrievalWorker(run: {
  repository: ProcurementStore;
  gate: SiteGate;
  control: RunControl;
  queue: RetrievalQueue;
  live: LiveView;
  ledger: RunLedger;
  analyses: AnalysisTasks;
  turn: RetrievalDeps;
  /** How long one record's turn may take. */
  deadlineMs: number;
}): RetrievalWorker {
  const { repository, gate, control, queue, live, ledger } = run;
  const turns = { retrievalTurns: 0, refreshTurns: 0 };

  /** Whether anything after this request may still ask the site; if not, its pause can go. */
  const moreToAsk = () => !queue.drained || gate.pending > 0;

  /** One project's turn at the site, then its Archive handed to Analysis. Throws only if the store does. */
  const take = async (candidate: Candidate, leaveRoom?: () => void): Promise<void> => {
    const { record, fresh } = candidate;
    if (fresh) await ledger.takeUp(record);

    let hold: SiteGateHold | undefined;
    const guard: RecordGuard = {
      expired: false,
      siteRequest: false,
      controller: new AbortController(),
      siteDown: false,
    };
    const inTime = () => !guard.expired;
    let slot = RETRIEVAL_SLOT;
    let stage: IngestionFailure['stage'] = 'timeline';
    const show = (replacing?: number) =>
      live.show(
        {
          slot,
          projectId: record.projectId,
          projectName: record.projectName,
          stage,
          fresh,
          since: new Date().toISOString(),
        },
        replacing,
      );
    show();
    const work: RecordWork = {
      record,
      get stage() {
        return stage;
      },
      set stage(next) {
        stage = next;
        show();
      },
      guard,
      site: async (call) => {
        guard.siteRequest = true;
        try {
          return await control.askSite(call, guard);
        } finally {
          guard.siteRequest = false;
        }
      },
      // A pause follows only where another site request may come.
      endSiteSection: () => {
        void hold?.release({ pauseAfter: moreToAsk() });
      },
      store: {
        amend: async (...args) => (inTime() ? repository.amend(...args) : undefined),
        transition: async (...args) => (inTime() ? repository.transition(...args) : undefined),
        tombstone: async (tombstone) => {
          if (inTime()) await repository.tombstone(tombstone);
        },
      },
      note: async (stage, error, kind) => {
        if (inTime()) await ledger.note(work.record, stage, error, kind);
      },
      count(outcome) {
        if (inTime()) ledger.tally[outcome] += 1;
      },
      leaveRoom,
      moveTo(next) {
        const from = slot;
        slot = next;
        show(from);
      },
      done() {
        live.remove(slot);
      },
    };

    let handoff: Handoff | undefined;
    let failedTurn = false;
    try {
      // Waiting for the gate is not the record's time: its deadline starts once
      // it has the site to itself, and covers the turn only.
      hold = await gate.acquire(fresh ? 'fresh' : 'refresh');
      turns[fresh ? 'retrievalTurns' : 'refreshTurns'] += 1;
      await withDeadline(
        async () => {
          handoff = await takeTurn(run.turn, work, fresh);
        },
        run.deadlineMs,
        guard,
      );
    } catch (error) {
      failedTurn = true;
      await ledger.fail(work, fresh, error);
    } finally {
      // Whatever ended the turn, the gate is not left held.
      await hold?.release();
    }

    if (failedTurn || !handoff) {
      work.leaveRoom?.();
      work.done();
      return;
    }
    run.analyses.start(work, fresh, handoff);
  };

  return {
    turns,
    async run() {
      for (;;) {
        // Nothing is taken from the queue once stopping: what is left stays
        // Queued, no attempt spent.
        if (!control.mayGoOn()) return;
        const next = queue.pick();
        if (!next) {
          if (queue.drained) return;
          // Wait for new work, Discovery's end, a place, or a stop. Each of them
          // wakes this, and none can happen between `pick` and here.
          await queue.waitForWork();
          continue;
        }
        live.report();
        await take(next.candidate, next.place);
      }
    },
  };
}
