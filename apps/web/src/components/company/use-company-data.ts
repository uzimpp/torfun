'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  createClient,
  createCompany,
  createExperience,
  deleteClient,
  deleteExperience,
  fetchClients,
  fetchExperiences,
  fetchMyCompany,
  joinCompany,
  updateClient,
  updateExperience,
  updateMyCompany,
  type ClientInput,
  type ClientResponse,
  type CompanyInput,
  type CompanyResponse,
  type ExperienceInput,
  type ExperienceResponse,
} from '@/lib/api';

/**
 * Everything the company page reads from and writes to the API.
 *
 * The page holds only UI state — which form is open, what is typed into it. The
 * three collections and every mutation live here, so a component never has to
 * know that a company is created and joined by one call while a client is
 * created by another.
 *
 * Mutations report failure by returning `null`/`false` and leaving a message in
 * `error` rather than throwing: a form that half-submits and then explodes is
 * worse for the officer than one that says what went wrong and keeps what they
 * typed.
 */
export interface CompanyData {
  /** The caller's own company, or null before they have joined one. */
  company: CompanyResponse | null;
  clients: ClientResponse[];
  experiences: ExperienceResponse[];
  loading: boolean;
  /** A message about the last failed read or write; null when all is well. */
  error: string | null;
  /** True while a write is in flight, so a form can stop double-submitting. */
  saving: boolean;
  /** Creates the company and joins the caller to it. */
  createOwnCompany: (input: CompanyInput) => Promise<boolean>;
  /** Edits the company the caller already belongs to. */
  editOwnCompany: (input: Partial<CompanyInput>) => Promise<boolean>;
  /** Joins a company a colleague already created, rather than making a second. */
  joinExistingCompany: (id: string) => Promise<boolean>;
  saveClient: (input: ClientInput, id?: string) => Promise<ClientResponse | null>;
  removeClient: (id: string) => Promise<boolean>;
  saveExperience: (input: ExperienceInput, id?: string) => Promise<boolean>;
  removeExperience: (id: string) => Promise<boolean>;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

export function useCompanyData(): CompanyData {
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [experiences, setExperiences] = useState<ExperienceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to reload everything after a write. */
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Guards against out-of-order responses: a fast reload must not be
    // overwritten by a slower one that was already on its way.
    let cancelled = false;

    Promise.all([fetchMyCompany(), fetchClients(), fetchExperiences()]).then(
      ([companyData, clientData, experienceData]) => {
        if (cancelled) return;
        setCompany(companyData);
        setClients(clientData.clients);
        setExperiences(experienceData.experiences);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(messageOf(caught, 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล'));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  /** One shape for every write: clear the error, run it, reload, report. */
  const run = useCallback(
    async <T>(work: () => Promise<T>, fallback: string): Promise<T | null> => {
      setSaving(true);
      setError(null);
      try {
        const result = await work();
        reload();
        return result;
      } catch (caught) {
        setError(messageOf(caught, fallback));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const createOwnCompany = useCallback(
    async (input: CompanyInput) => {
      const saved = await run(() => createCompany(input), 'บันทึกบริษัทไม่สำเร็จ');
      if (saved) setCompany(saved);
      return saved !== null;
    },
    [run],
  );

  const editOwnCompany = useCallback(
    async (input: Partial<CompanyInput>) => {
      const saved = await run(() => updateMyCompany(input), 'แก้ไขข้อมูลบริษัทไม่สำเร็จ');
      if (saved) setCompany(saved);
      return saved !== null;
    },
    [run],
  );

  const joinExistingCompany = useCallback(
    async (id: string) => {
      const joined = await run(() => joinCompany(id), 'เข้าร่วมบริษัทไม่สำเร็จ');
      if (joined) setCompany(joined);
      return joined !== null;
    },
    [run],
  );

  const saveClient = useCallback(
    (input: ClientInput, id?: string) =>
      run(
        () => (id ? updateClient(id, input) : createClient(input)),
        'บันทึกข้อมูลลูกค้าไม่สำเร็จ',
      ),
    [run],
  );

  const removeClient = useCallback(
    async (id: string) =>
      // A client that still has work recorded against it answers 409; the
      // message the API sends is what the officer needs to read.
      (await run(() => deleteClient(id).then(() => true), 'ลบลูกค้าไม่สำเร็จ')) !== null,
    [run],
  );

  const saveExperience = useCallback(
    async (input: ExperienceInput, id?: string) =>
      (await run(
        () => (id ? updateExperience(id, input) : createExperience(input)),
        'บันทึกผลงานไม่สำเร็จ',
      )) !== null,
    [run],
  );

  const removeExperience = useCallback(
    async (id: string) =>
      (await run(() => deleteExperience(id).then(() => true), 'ลบผลงานไม่สำเร็จ')) !== null,
    [run],
  );

  return {
    company,
    clients,
    experiences,
    loading,
    error,
    saving,
    createOwnCompany,
    editOwnCompany,
    joinExistingCompany,
    saveClient,
    removeClient,
    saveExperience,
    removeExperience,
  };
}
