import {
  thailandDay,
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
import type { FindOptions, ProcurementStore } from '../repositories/procurement.repository';
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
   * sent, so no `outcome` in the request can widen it back out. The existing
   * days-left order breaks score ties and is the fallback without company data.
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
    const filters = resolveProcurementListOptions({ ...narrowed, order: 'daysLeft' }, now);
    if (!filters) return { items: [], total: 0 };
    const inputs =
      userId && (audience === 'officer' || order === 'match')
        ? await this.qualifications?.matchingInputs(userId)
        : null;
    const today = thailandDay(now);
    const score = (clauses: TorAnalysis['qualifications']) =>
      clauses?.length && inputs
        ? evaluateQualifications(clauses, inputs.profile, inputs.experiences, today).overallScore
        : null;
    const canScore =
      inputs &&
      (inputs.experiences.length ||
        inputs.profile.certificates.length ||
        inputs.profile.personnel.length ||
        inputs.profile.registeredCapitalThb !== null);
    const { items, total } = await this.procurements.find({
      ...filters,
      ...(canScore && order === 'match' ? { scoreQualifications: score } : {}),
    });
    return {
      items: items.map((item) => ({
        ...presentTo(audience, item),
        ...(canScore ? { matchScore: score(item.analysis?.qualifications) } : {}),
      })),
      total,
    };
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
            )
          : null,
    };
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
