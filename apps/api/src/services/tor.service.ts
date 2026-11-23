import {
  BUDGET_COMPARISON_MIN_SAMPLE,
  compareBudget,
  thailandDay,
  type BudgetComparison,
  type BudgetComparisonBasis,
  type BudgetComparisonGroup,
  type Procurement,
  type TorAnalysis,
  type TorDetail,
  type TorListItem,
  type TorListOrder,
} from '@torfun/types';
import type { CompanyQualificationsService } from './company-qualifications.service';
import { computeQualificationMatch, evaluateQualifications } from './qualification-match';
import { resolveProcurementListOptions } from './procurement-list-options';
import { NotFoundError } from '../core/errors';
import type {
  ComparableQuery,
  FindOptions,
  ProcurementStore,
} from '../repositories/procurement.repository';
import { downloadArchive, extractTorPdfs } from './egp/tor-package';
import { isVisibleTo, OFFICER_VISIBLE_OUTCOME, presentTo, type Audience } from './audience';

export interface TorSource {
  filename: string;
  bytes: Uint8Array;
}

export class TorService {
  constructor(
    private readonly procurements: ProcurementStore,
    private readonly download: (zipId: string) => Promise<Uint8Array> = downloadArchive,
    private readonly now: () => Date = () => new Date(),
    private readonly qualifications?: CompanyQualificationsService,
  ) {}

  /**
   * An officer's query is narrowed to analysed TORs here, after whatever they
   * sent, so no `outcome` in the request can widen it back out. Search excludes
   * removed TORs for every audience. Days left breaks score ties and is the
   * fallback without company data.
   */
  async list(
    options: FindOptions,
    audience: Audience,
    userId?: string,
    order: TorListOrder = 'match',
  ): Promise<{ items: TorListItem[]; total: number }> {
    const narrowed =
      audience === 'admin' ? options : { ...options, outcome: OFFICER_VISIBLE_OUTCOME };
    const now = this.now();
    const filters = resolveProcurementListOptions(
      { ...narrowed, order: order === 'match' ? 'daysLeft' : order, excludeRemoved: true },
      now,
    );
    if (!filters) return { items: [], total: 0 };
    const inputs =
      userId && (audience === 'officer' || order === 'match')
        ? await this.qualifications?.matchingInputs(userId)
        : null;
    const today = thailandDay(now);
    const score = (clauses: TorAnalysis['qualifications'], projectMoney: number | null) =>
      clauses?.length && inputs
        ? evaluateQualifications(clauses, inputs.profile, inputs.experiences, today, projectMoney)
            .overallScore
        : null;
    const canScore =
      inputs &&
      (inputs.experiences.length ||
        inputs.profile.certificates.length ||
        inputs.profile.personnel.length ||
        inputs.profile.registeredCapitalThb !== null ||
        inputs.profile.bidBudgetMinThb !== null ||
        inputs.profile.bidBudgetMaxThb !== null);
    const { items, total } = await this.procurements.find({
      ...filters,
      ...(canScore && order === 'match' ? { scoreQualifications: score } : {}),
    });
    return {
      items: items.map((item) => ({
        ...presentTo(audience, item),
        ...(canScore
          ? { matchScore: score(item.analysis?.qualifications, item.projectMoney) }
          : {}),
      })),
      total,
    };
  }

  years(): Promise<number[]> {
    return this.procurements.years();
  }

  /** A record the audience may not see is reported exactly as one that does not exist. */
  async get(projectId: string, audience: Audience): Promise<Procurement> {
    const procurement = await this.procurements.get(projectId);
    if (!procurement || !isVisibleTo(audience, procurement)) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }
    return presentTo(audience, procurement);
  }

  async detail(projectId: string, audience: Audience, userId: string): Promise<TorDetail> {
    const procurement = await this.get(projectId, audience);
    const clauses = procurement.analysis?.qualifications;
    const inputs = clauses?.length ? await this.qualifications?.matchingInputs(userId) : null;
    const now = this.now();
    return {
      ...procurement,
      matchResult:
        clauses?.length && inputs
          ? computeQualificationMatch(
              projectId,
              clauses,
              inputs.profile,
              inputs.experiences,
              thailandDay(now),
              now,
              procurement.projectMoney,
            )
          : null,
    };
  }

  /**
   * The planned budget of a TOR against those of similar earlier procurements
   * (#61), in three separate groups: the same e-GP category, the same agency, a
   * shared technology. A comparable is another procurement an officer may see
   * (`OFFICER_VISIBLE_OUTCOME`, not removed) with a planned budget that was
   * announced strictly before this one. Who asks changes nothing: an administrator
   * and an officer get the same comparables, and only a record the caller may
   * open can be compared at all (`get`). An undated TOR has no "earlier", so it
   * has no comparables.
   */
  async budgetComparison(projectId: string, audience: Audience): Promise<BudgetComparison> {
    const tor = await this.get(projectId, audience);
    if (tor.projectMoney === null) {
      return { minSample: BUDGET_COMPARISON_MIN_SAMPLE, budget: null, groups: [] };
    }

    const announced = tor.announceDate === null ? Number.NaN : Date.parse(tor.announceDate);
    const base = { visibleOutcome: OFFICER_VISIBLE_OUTCOME, excludeProjectId: projectId };
    const terms = [...new Set((tor.analysis?.techStack ?? []).map((term) => term.trim()))].filter(
      Boolean,
    );
    const plans: [BudgetComparisonBasis, string | null, ComparableQuery | null][] = [
      [
        'category',
        tor.goodsId && tor.typeId ? `${tor.goodsId}/${tor.typeId}` : null,
        tor.goodsId && tor.typeId ? { ...base, goodsId: tor.goodsId, typeId: tor.typeId } : null,
      ],
      [
        'agency',
        tor.deptName.trim() ? tor.deptName : null,
        tor.deptName.trim() ? { ...base, deptName: tor.deptName } : null,
      ],
      [
        'tech',
        terms.length > 0 ? terms.join(', ') : null,
        terms.length > 0 ? { ...base, techStack: terms } : null,
      ],
    ];

    const groups = await Promise.all(
      plans.map(async ([basis, criterion, query]): Promise<BudgetComparisonGroup> => {
        if (!criterion || !query || Number.isNaN(announced)) {
          return { basis, criterion: null, count: 0, summary: null, projects: [] };
        }
        const earlier = (await this.procurements.listComparables(query)).filter((candidate) => {
          const at =
            candidate.announceDate === null ? Number.NaN : Date.parse(candidate.announceDate);
          return !Number.isNaN(at) && at < announced;
        });
        return { basis, criterion, ...compareBudget(tor.projectMoney!, earlier) };
      }),
    );
    return { minSample: BUDGET_COMPARISON_MIN_SAMPLE, budget: tor.projectMoney, groups };
  }

  async source(projectId: string, audience: Audience): Promise<TorSource> {
    const { archive: stored } = await this.get(projectId, audience);
    if (!stored) throw new NotFoundError('No TOR source is available');

    const mainTor = stored.documents.find((document) => document.role === 'main_tor');
    if (!mainTor) throw new NotFoundError('No main TOR document is available');

    const archive = await this.download(stored.zipId);
    const extracted = extractTorPdfs(archive);
    const pdf = extracted.torFiles.find((file) => file.member === mainTor.member);
    if (!pdf) throw new NotFoundError('The main TOR document is no longer available');

    return { filename: pdf.filename, bytes: pdf.payload };
  }
}
