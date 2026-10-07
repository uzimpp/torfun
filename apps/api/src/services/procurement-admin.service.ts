import type { FastifyBaseLogger } from 'fastify';
import type { Procurement, Tombstone, TombstoneReason } from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import type { ProcurementStore } from '../repositories/procurement.repository';
import { OFFICER_VISIBLE_OUTCOME } from './audience';
import { queuedRecord } from './egp/feed-record';
import { buildTombstone } from './egp/tombstone';
import type { StartRunInput } from './ingestion.service';

/**
 * What a Site Administrator may do to a procurement, over the same store the
 * pipeline writes.
 *
 * These are people overruling the model, so each one records who and when: on
 * the record itself where the record stays (an approval), in the tombstone where
 * it goes, and in the log where nothing else is kept. None of them reaches the
 * upstream site; that is the Run's business alone.
 */
export class ProcurementAdminService {
  constructor(
    private readonly store: ProcurementStore,
    /** Starts a Run; refuses with a conflict if one is going. It is `IngestionService.startRun`. */
    private readonly startRun: (input: StartRunInput) => Promise<void>,
    private readonly logger: FastifyBaseLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async getOrThrow(projectId: string): Promise<Procurement> {
    const record = await this.store.get(projectId);
    if (!record) throw new NotFoundError(`ไม่พบโครงการ ${projectId}`);
    return record;
  }

  /** A held record to officers. Only a held record: anything else was not waiting for a person. */
  async approve(projectId: string, by: string): Promise<void> {
    const record = await this.getOrThrow(projectId);
    if (record.outcome !== 'needs_review') {
      throw new ConflictError(`โครงการ ${projectId} ไม่ได้อยู่ในรายการรอตรวจสอบ จึงอนุมัติไม่ได้`);
    }
    await this.store.transition(
      projectId,
      OFFICER_VISIBLE_OUTCOME,
      { approvedBy: by, approvedAt: this.now().toISOString() },
      `Approved by ${by}`,
    );
    this.logger.info({ projectId, by }, 'egp: an administrator approved a held project');
  }

  /**
   * The model's reading was wrong, or never reached. What was read goes; the
   * project is remembered as non-software, with the model's own reason as the
   * evidence where it gave one, so no later sweep stores it again.
   */
  async markNonSoftware(projectId: string, by: string): Promise<void> {
    const record = await this.getOrThrow(projectId);
    await this.tombstoneRecord(record, 'admin_non_software', by, record.analysis?.reason);
    this.logger.info({ projectId, by }, 'egp: an administrator marked a project non-software');
  }

  /**
   * Delete a record, whatever it holds. Blocking re-import leaves a tombstone, so
   * no sweep stores the project again; allowing it leaves nothing, and the next
   * sweep that finds the project stores it as new.
   */
  async deleteProcurement(
    projectId: string,
    by: string,
    options: { allowReimport: boolean },
  ): Promise<void> {
    const record = await this.getOrThrow(projectId);
    if (options.allowReimport) await this.store.remove(projectId);
    else await this.tombstoneRecord(record, 'admin_deleted', by);
    this.logger.info(
      { projectId, by, allowReimport: options.allowReimport },
      'egp: an administrator deleted a project',
    );
  }

  /** What was dropped, newest first. */
  tombstones(): Promise<Tombstone[]> {
    return this.store.listTombstones();
  }

  /**
   * Forget a drop, and nothing more. The project is stored by the next sweep that
   * finds it and read in the ordinary course of a Run; nothing is fetched now.
   */
  async removeTombstone(projectId: string, by: string): Promise<void> {
    if (!(await this.store.removeTombstone(projectId))) {
      throw new NotFoundError(`ไม่พบโครงการ ${projectId} ในรายการที่ถูกคัดออก`);
    }
    this.logger.info({ projectId, by }, 'egp: an administrator removed a tombstone');
  }

  /**
   * Lift a drop and have the project read again, once.
   *
   * The record was deleted, so it is rebuilt from what the feed said about it,
   * which the tombstone keeps. Reading it is a Run like any other: it takes the
   * lease, goes through the one site gate, and stops on a refusal. It is told to
   * retrieve this project alone, so the site sees one lookup and one download,
   * not the queue. The tombstone is lifted, and the record queued, only once the
   * Run holds the lease: a refused start leaves the tombstone standing, and a
   * sweep already running cannot admit the project in the gap.
   *
   * A tombstone written before the snapshot was kept has nothing to rebuild
   * from, so that Run is also told to sweep, in the hope the feed lists the
   * project again. The feed is read by date, so for an older project it will
   * not, and the Run says so in the failure log.
   */
  async restoreTombstone(projectId: string, by: string): Promise<void> {
    // Looked for before a Run is asked for, so a project with no tombstone never
    // takes the lease (and never has it taken from a schedule for nothing).
    // `beforeRun` still lifts it, and still fails safe if it vanished in between.
    const tombstone = await this.store.getTombstone(projectId);
    if (!tombstone) {
      throw new NotFoundError(`ไม่พบโครงการ ${projectId} ในรายการที่ถูกคัดออก`);
    }
    const feed = tombstone.feed ?? null;
    try {
      await this.startRun({
        ...(feed ? {} : { forceDiscovery: true }),
        onlyProject: projectId,
        beforeRun: async () => {
          await this.removeTombstone(projectId, by);
          if (feed) await this.store.upsert(queuedRecord(projectId, feed, this.now()));
        },
      });
    } catch (error) {
      // The only conflict a start can meet is a Run already going; say so in
      // the words the administrator reads, since the message is shown as it is.
      if (error instanceof ConflictError) {
        throw new ConflictError(
          'มีการดึงข้อมูลกำลังทำงานอยู่ กรุณารอให้เสร็จก่อนแล้วลองกู้คืนอีกครั้ง',
        );
      }
      throw error;
    }
    this.logger.info(
      { projectId, by },
      'egp: an administrator restored a tombstone, one read queued',
    );
  }

  /** Replace a record with the tombstone that stops it coming back. */
  private tombstoneRecord(
    record: Procurement,
    reason: TombstoneReason,
    by: string,
    evidence?: string | null,
  ): Promise<void> {
    return this.store.tombstone(
      buildTombstone({
        projectId: record.projectId,
        reason,
        evidence,
        promptVersion: record.analysis?.promptVersion,
        decidedBy: by,
        now: this.now(),
        record,
      }),
    );
  }
}
