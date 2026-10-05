import type { Procurement } from '@torfun/types';
import { NotFoundError } from '../core/errors';
import type { ProcurementStore } from '../repositories/procurement.repository';
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
  ) {}

  async get(projectId: string): Promise<Procurement> {
    const procurement = await this.procurements.get(projectId);
    if (!procurement) throw new NotFoundError(`No ingested project ${projectId}`);
    return procurement;
  }

  async source(projectId: string): Promise<TorSource> {
    const procurement = await this.get(projectId);
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
