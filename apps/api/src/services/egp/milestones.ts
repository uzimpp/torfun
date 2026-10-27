import {
  EMPTY_STAGES,
  MILESTONE_KEYS,
  type MilestoneKey,
  type ProcurementStatus,
  type Stages,
} from '@torfun/types';
import { convertTimelineDate } from './dates';

/**
 * Turns e-GP's announcement timeline into our own vocabulary.
 *
 * The site's codes are used once, here, to set a stage, and are not kept. A
 * code not listed is not guessed at: it changes nothing and is handed back so
 * the pipeline can log it.
 */

/** One row of the greenBook timeline. */
export interface AnnouncementRow {
  announceType: string;
  /** UTC ISO timestamp, or null where e-GP gives none. */
  announceDate: string | null;
}

const MILESTONE_BY_CODE: Record<string, MilestoneKey> = {
  BOQ: 'drafted',
  B0: 'drafted',
  D0: 'invited',
  price: 'priced',
  S0: 'evaluated',
  E0: 'evaluated',
  W0: 'awarded',
  I0: 'contracted',
};

const STATUS_BY_MILESTONE: Record<MilestoneKey, ProcurementStatus> = {
  drafted: 'drafting',
  invited: 'open',
  priced: 'evaluating',
  evaluated: 'evaluating',
  awarded: 'awarded',
  contracted: 'contracted',
};

export interface StageReading {
  stages: Stages;
  /** The stage of the highest one reached, dated or not; `unknown` where none is. */
  status: ProcurementStatus;
  /** One row per distinct code that is not mapped. */
  unrecognised: AnnouncementRow[];
}

export function readStages(rows: readonly AnnouncementRow[]): StageReading {
  const stages: Stages = { ...EMPTY_STAGES };
  const reached = new Set<MilestoneKey>();
  const unrecognised = new Map<string, AnnouncementRow>();

  for (const row of rows) {
    const key = MILESTONE_BY_CODE[row.announceType];
    if (!key) {
      if (!unrecognised.has(row.announceType)) unrecognised.set(row.announceType, row);
      continue;
    }
    reached.add(key);
    // ISO strings of equal shape order by time, and a date outranks none.
    const at = convertTimelineDate(row.announceDate);
    const kept = stages[key];
    stages[key] = kept !== null && (at === null || kept > at) ? kept : at;
  }

  const highest = [...MILESTONE_KEYS].reverse().find((key) => reached.has(key));
  return {
    stages,
    status: highest ? STATUS_BY_MILESTONE[highest] : 'unknown',
    unrecognised: [...unrecognised.values()],
  };
}
