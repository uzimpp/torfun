import type { SourceAgency } from '@torfun/types';
import type {
  SourceRegistryStore,
  StoredSourceRegistry,
} from '../repositories/source-registry.repository';

/** An in-memory `SourceRegistryStore`. */
export class InMemorySourceRegistryStore implements SourceRegistryStore {
  private stored: StoredSourceRegistry | null = null;

  async get(): Promise<StoredSourceRegistry | null> {
    return this.stored;
  }

  async save(
    agencies: SourceAgency[],
    updatedBy: string,
    at: string,
  ): Promise<StoredSourceRegistry> {
    this.stored = { agencies: agencies.map((agency) => ({ ...agency })), updatedAt: at, updatedBy };
    return this.stored;
  }
}
