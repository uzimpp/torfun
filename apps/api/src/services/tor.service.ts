import type { Procurement } from '@torfun/types';
import { resolveProcurementListOptions } from './procurement-list-options';
import { NotFoundError } from '../core/errors';
import type {
  FindOptions,
  FindResult,
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
  ) {}

  /**
   * An officer's query is narrowed to analysed TORs here, after whatever they
   * sent, so no `outcome` in the request can widen it back out. Search shows
   * the tenders with the most days left first.
   */
  async list(options: FindOptions, audience: Audience): Promise<FindResult> {
    const narrowed =
      audience === 'admin' ? options : { ...options, outcome: OFFICER_VISIBLE_OUTCOME };
    const filters = resolveProcurementListOptions({ ...narrowed, order: 'daysLeft' }, this.now());
    if (!filters) return { items: [], total: 0 };
    const { items, total } = await this.procurements.find(filters);
    return { items: items.map((item) => presentTo(audience, item)), total };
  }

  /** A record the audience may not see is reported exactly as one that does not exist. */
  async get(projectId: string, audience: Audience): Promise<Procurement> {
    const procurement = await this.procurements.get(projectId);
    if (!procurement || !isVisibleTo(audience, procurement)) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }
    return presentTo(audience, procurement);
  }

  async source(projectId: string, audience: Audience): Promise<TorSource> {
    const procurement = await this.get(projectId, audience);
    if (!procurement.zipId) throw new NotFoundError('No TOR source is available');

    const mainTor = procurement.documents.find((document) => document.role === 'main_tor');
    if (!mainTor) throw new NotFoundError('No main TOR document is available');

    const archive = await this.download(procurement.zipId);
    const extracted = extractTorPdfs(archive);
    const pdf = extracted.torFiles.find((file) => file.member === mainTor.member);
    if (!pdf) throw new NotFoundError('The main TOR document is no longer available');

    return { filename: pdf.filename, bytes: pdf.payload };
  }
}
