import type { SourceAgencyEdit, SourceAgencyInput, SourceRegistryView } from '@torfun/types';
import { ApiError, apiFetch } from './api';

/**
 * The Source Registry endpoints (administrators only), over the same
 * session-renewing `apiFetch` as the rest of the console.
 */

async function sourcesRequest(path: string, init?: RequestInit): Promise<SourceRegistryView> {
  const response = await apiFetch(`/api/ingestion/sources${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
  }
  return (await response.json()) as SourceRegistryView;
}

export const fetchSources = () => sourcesRequest('');

export const addSource = (input: SourceAgencyInput) =>
  sourcesRequest('', { method: 'POST', body: JSON.stringify(input) });

export const editSource = (deptId: string, edit: SourceAgencyEdit) =>
  sourcesRequest(`/${encodeURIComponent(deptId)}`, { method: 'PUT', body: JSON.stringify(edit) });

export const removeSource = (deptId: string) =>
  sourcesRequest(`/${encodeURIComponent(deptId)}`, { method: 'DELETE' });
