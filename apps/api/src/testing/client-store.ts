import { ObjectId } from 'mongodb';
import type { Client } from '@torfun/types';
import type { ClientPatch, ClientStore, NewClient } from '../repositories/client.repository';

/**
 * An in-memory `ClientStore`.
 *
 * The company scope is honoured exactly as the repository honours it — every
 * lookup filters on `companyId` first — so a cross-company test fails here for
 * the same reason it would fail against Mongo, rather than passing because a
 * fake was more permissive than the real thing.
 */
export class InMemoryClientStore implements ClientStore {
  private readonly clients = new Map<string, Client>();

  async listByCompany(companyId: string): Promise<Client[]> {
    return [...this.clients.values()]
      .filter((client) => client.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(companyId: string, id: string): Promise<Client | null> {
    const client = this.clients.get(id);
    return client && client.companyId === companyId ? client : null;
  }

  async create(input: NewClient): Promise<Client> {
    const now = new Date();
    const client: Client = {
      id: new ObjectId().toString(),
      companyId: input.companyId,
      name: input.name,
      kind: input.kind,
      createdAt: now,
      updatedAt: now,
    };
    this.clients.set(client.id, client);
    return client;
  }

  async update(companyId: string, id: string, patch: ClientPatch): Promise<Client | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) return null;

    const updated: Client = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      updatedAt: new Date(),
    };
    this.clients.set(id, updated);
    return updated;
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    if (!(await this.findById(companyId, id))) return false;
    return this.clients.delete(id);
  }

  async suggestNames(companyId: string, query: string, limit: number): Promise<string[]> {
    const names = (await this.listByCompany(companyId))
      .map((client) => client.name)
      .filter((name) => name.toLowerCase().includes(query.toLowerCase()));
    return [...new Set(names)].slice(0, limit);
  }
}
