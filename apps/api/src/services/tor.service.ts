import type { Procurement } from '@torfun/types';
import { resolveProcurementListOptions } from './procurement-list-options';
import { NotFoundError } from '../core/errors';
import type {
  FindOptions,
  FindResult,
  ProcurementStore,
} from '../repositories/procurement.repository';
import { downloadArchive, extractTorPdfs } from './egp/tor-package';
import { unzipSync } from 'fflate';

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

  list(options: FindOptions, includeHeld = false): Promise<FindResult> {
    const filters = resolveProcurementListOptions(
      { ...options, excludeHeld: !includeHeld, excludeRemoved: !includeHeld },
      this.now(),
    );
    return filters ? this.procurements.find(filters) : Promise.resolve({ items: [], total: 0 });
  }

  async get(projectId: string, includeHeld = false): Promise<Procurement> {
    const procurement = await this.procurements.get(projectId);
    if (
      !procurement ||
      (!includeHeld && (procurement.outcome === 'needs_review' || procurement.publicationRemovedAt))
    ) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }
    return procurement;
  }

  async source(projectId: string, includeHeld = false): Promise<TorSource> {
    const procurement = await this.get(projectId, includeHeld);
    if (!procurement.zipId) throw new NotFoundError('No TOR source is available');

    const mainTor = procurement.documents.find((document) => document.role === 'main_tor');
    if (!mainTor) throw new NotFoundError('No main TOR document is available');

    const archive = await this.download(procurement.zipId);
    const extracted = extractTorPdfs(archive, unzipSync);
    const pdf = extracted.torFiles.find((file) => file.member === mainTor.member);
    if (!pdf) throw new NotFoundError('The main TOR document is no longer available');

    return { filename: pdf.filename, bytes: pdf.payload };
  }
}
