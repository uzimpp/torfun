import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import type { Company, CompanyQualifications, CompanyQualificationsRecord } from '@torfun/types';
import type { CompanyPatch, CompanyStore, NewCompany } from '../repositories/company.repository';

/**
 * An in-memory `CompanyStore`.
 *
 * It really stores companies and really matches a substring the way the
 * repository's regex does, so a test asserts on the record a request left
 * behind. Ordering and collation are the real repository's integration tests'
 * business, which is where a Mongo sort can actually be verified.
 */
export class InMemoryCompanyStore implements CompanyStore {
  private readonly companies = new Map<string, Company>();

  private readonly qualifications = new Map<string, CompanyQualificationsRecord>();

  async findQualifications(companyId: string): Promise<CompanyQualificationsRecord | null> {
    if (!this.companies.has(companyId)) return null;
    return (
      this.qualifications.get(companyId) ?? {
        companyId,
        revision: null,
        registeredCapitalThb: null,
        certificates: [],
        personnel: [],
      }
    );
  }

  async replaceQualifications(
    companyId: string,
    revision: string | null,
    input: CompanyQualifications,
  ): Promise<CompanyQualificationsRecord | null> {
    if (
      !this.companies.has(companyId) ||
      (this.qualifications.get(companyId)?.revision ?? null) !== revision
    ) {
      return null;
    }
    const record = { ...input, companyId, revision: randomUUID() };
    this.qualifications.set(companyId, record);
    return record;
  }

  async findById(id: string): Promise<Company | null> {
    return this.companies.get(id) ?? null;
  }

  async search(query: string, limit: number): Promise<Company[]> {
    return [...this.companies.values()]
      .filter((company) => company.nameTh.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.nameTh.localeCompare(b.nameTh))
      .slice(0, limit);
  }

  async create(input: NewCompany): Promise<Company> {
    const now = new Date();
    const company: Company = {
      id: new ObjectId().toString(),
      nameTh: input.nameTh,
      tin: input.tin,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(company.id, company);
    return company;
  }

  async update(id: string, patch: CompanyPatch): Promise<Company | null> {
    const existing = this.companies.get(id);
    if (!existing) return null;

    const updated: Company = {
      ...existing,
      ...(patch.nameTh !== undefined ? { nameTh: patch.nameTh } : {}),
      ...(patch.tin !== undefined ? { tin: patch.tin } : {}),
      updatedAt: new Date(),
    };
    this.companies.set(id, updated);
    return updated;
  }
}
