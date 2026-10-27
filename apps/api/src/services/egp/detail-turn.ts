import type { Procurement } from '@torfun/types';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import { goodsInScope } from './admission';
import type { AnnouncementClient, DraftListParams } from './announcement-client';
import { DISCOVERY_SLOT, type LiveView } from './live-view';
import { withDeadline, type RecordGuard, type RecordWork } from './record-work';
import type { RunControl } from './run-control';
import type { RunLedger } from './run-ledger';
import { SiteClosedError, SiteLatchedError, type SiteGate } from './site-gate';

/**
 * Discovery's last word on a project (ADR-0021): its procurement detail, read
 * in one gate turn at the `detail` tier before Retrieval may take it.
 *
 * The Goods Category decides whether there is any Retrieval at all. Out of
 * scope, the record is kept as `out_of_scope` with what the detail said, and
 * nothing more is read. In scope, the same hold reads the budget year
 * (getProjectDetail) and, for a project the feed listed as a draft, the last
 * day for comments; `detailReadAt` is set and the record is handed on.
 *
 * `detailReadAt` stays null until a turn completes, so a project whose turn
 * failed or was never taken is read again next Run. `data: null` leaves the
 * record as it was; any other failure spends an attempt, as Retrieval's does.
 */

export type DetailWork = Pick<RecordWork, 'record' | 'guard' | 'site' | 'store' | 'note' | 'count'>;

export type DetailReading =
  | { kind: 'unavailable' }
  | { kind: 'expired' }
  | { kind: 'out_of_scope' }
  | { kind: 'in_scope'; patch: Partial<Procurement>; params: DraftListParams | null };

export async function admitByProcurementDetail(
  announcements: AnnouncementClient,
  work: DetailWork,
): Promise<DetailReading> {
  const { record, guard } = work;
  const { projectId } = record;
  const signal = guard.controller.signal;
  const detail = await work.site(() => announcements.procurementDetail(projectId, signal));
  if (guard.expired) return { kind: 'expired' };
  if (detail === null) {
    await work.note(
      'discovery',
      'e-GP gave no procurement detail for this project (data: null); it is asked again next Run.',
    );
    return { kind: 'unavailable' };
  }
  const fields = {
    goodsId: detail.goodsId,
    typeId: detail.typeId,
    deptSubName: detail.deptSubName,
    projectMoney: detail.projectMoney,
    priceBuild: detail.priceBuild,
  };

  if (!goodsInScope(detail.goodsId)) {
    await work.store.transition(
      projectId,
      'out_of_scope',
      { ...fields, detailReadAt: new Date().toISOString() },
      `Goods Category ${detail.goodsId} is not one software work is filed under (ADR-0021).`,
    );
    work.count('outOfScope');
    return { kind: 'out_of_scope' };
  }

  let { budgetYear } = record;
  if (budgetYear === null) {
    const project = await work.site(() => announcements.projectDetail(projectId, signal));
    if (guard.expired) return { kind: 'expired' };
    if (project === null) {
      await work.note(
        'discovery',
        'e-GP gave no project detail with a budget year for this project.',
      );
    }
    budgetYear = project?.budgetYear ?? null;
  }
  return {
    kind: 'in_scope',
    patch: { ...fields, budgetYear, detailReadAt: new Date().toISOString() },
    params: detail.draftListParams,
  };
}

export interface DetailCandidate {
  record: Procurement;
  /** The feed listed it only as a draft (B0), so its comment deadline is asked for. */
  draft: boolean;
}

export interface DetailWorker {
  /** Add a project. One already queued this Run is not queued again. */
  enqueue(candidate: DetailCandidate): void;
  /** Nothing more will join. */
  end(): void;
  /** Wakes the worker if it is waiting, so it sees a stop. */
  wake(): void;
  /** Work the queue until it is ended and empty, or the Run stops. Throws only if the store does. */
  run(): Promise<void>;
  /** Gate turns taken, for the Run's timing log. */
  readonly turns: number;
}

export function createDetailWorker(run: {
  repository: ProcurementStore;
  gate: SiteGate;
  control: RunControl;
  live: LiveView;
  ledger: RunLedger;
  announcements: AnnouncementClient;
  /** Given each project admitted, with its detail read, for Retrieval. */
  admitted: (record: Procurement) => void;
  deadlineMs: number;
}): DetailWorker {
  const { repository, gate, control, live, ledger, announcements } = run;
  const waiting: DetailCandidate[] = [];
  const queued = new Set<string>();
  let ended = false;
  let turns = 0;
  let wakeUp: (() => void) | null = null;
  const wake = () => {
    const resolve = wakeUp;
    wakeUp = null;
    resolve?.();
  };

  /** One project's turn; false where the gate turned it away and the Run is stopping. */
  const take = async ({ record, draft }: DetailCandidate): Promise<boolean> => {
    const guard: RecordGuard = {
      expired: false,
      siteRequest: false,
      controller: new AbortController(),
      siteDown: false,
    };
    const site = async <T>(call: () => Promise<T>): Promise<T> => {
      guard.siteRequest = true;
      try {
        return await control.askSite(call, guard);
      } finally {
        guard.siteRequest = false;
      }
    };
    const { projectId } = record;
    const signal = guard.controller.signal;
    const work: DetailWork = {
      record,
      guard,
      site,
      store: repository,
      note: (stage, error, kind) => ledger.note(record, stage, error, kind),
      count: (outcome) => {
        ledger.tally[outcome] += 1;
      },
    };

    let hold;
    try {
      hold = await gate.acquire('detail');
    } catch (error) {
      if (error instanceof SiteLatchedError || error instanceof SiteClosedError) return false;
      throw error;
    }
    turns += 1;
    live.show({
      slot: DISCOVERY_SLOT,
      projectId,
      projectName: record.projectName,
      stage: 'discovery',
      fresh: true,
      since: new Date().toISOString(),
    });
    try {
      await withDeadline(
        async () => {
          const reading = await admitByProcurementDetail(announcements, work);
          if (reading.kind !== 'in_scope') return;
          const { params } = reading;
          const commentsCloseAt =
            draft && params
              ? await site(() => announcements.commentsCloseAt(projectId, params, signal))
              : record.timeline.commentsCloseAt;
          if (guard.expired) return;
          const patch = { ...reading.patch, timeline: { ...record.timeline, commentsCloseAt } };
          await repository.amend(projectId, patch, true);
          run.admitted({ ...record, ...patch });
        },
        run.deadlineMs,
        guard,
      );
    } catch (error) {
      await ledger.fail({ record, stage: 'discovery', guard }, true, error);
    } finally {
      live.remove(DISCOVERY_SLOT);
      await hold.release();
    }
    return true;
  };

  return {
    enqueue(candidate) {
      if (queued.has(candidate.record.projectId)) return;
      queued.add(candidate.record.projectId);
      waiting.push(candidate);
      wake();
    },
    end() {
      ended = true;
      wake();
    },
    wake,
    get turns() {
      return turns;
    },
    async run() {
      for (;;) {
        // What is left stays Queued with its detail unread, for the next Run.
        if (!control.mayGoOn()) return;
        const next = waiting.shift();
        if (!next) {
          if (ended) return;
          await new Promise<void>((resolve) => {
            wakeUp = resolve;
          });
          continue;
        }
        if (!(await take(next))) return;
      }
    },
  };
}
