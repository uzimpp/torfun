import type {
  ClientKind,
  DurationUnit,
  IngestionFailure,
  IngestionOutcome,
  Procurement,
  IngestionState,
  IngestionSummary,
  SoftwareClass,
  TargetPlatform,
} from '@torfun/types';

/**
 * Thin client for the ingestion API.
 *
 * The API runs as a separate service, so every call is absolute and errors are
 * surfaced rather than swallowed — a dashboard that silently shows an empty
 * table when the backend is down is worse than one that says so.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type IngestionSummaryResponse = IngestionSummary & { agencies: string[] };

export interface ProjectListResponse {
  items: Procurement[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectFilters {
  state?: IngestionState;
  outcome?: IngestionOutcome;
  deptName?: string;
  year?: number;
  softwareClass?: SoftwareClass;
  eBidding?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Headers for one call. `Content-Type: application/json` is set only when there
 * is actually a body to describe: Fastify rejects a request that declares JSON
 * and then sends nothing (`FST_ERR_CTP_EMPTY_JSON_BODY`), which is what a
 * body-less POST or DELETE — joining a company, deleting a client — would be.
 */
function headersFor(init?: RequestInit): HeadersInit {
  return init?.body === undefined || init.body === null
    ? { ...init?.headers }
    : { 'Content-Type': 'application/json', ...init?.headers };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // The ingestion API is admin-only and the session lives in an httpOnly
      // cookie on a different origin, so every call must carry credentials.
      credentials: 'include',
      headers: headersFor(init),
    });
  } catch (error) {
    // A network-level failure has no status; distinguish it from a 500 so the
    // UI can say "can't reach the API" rather than "the API is broken".
    throw new ApiError(
      `Cannot reach the API at ${API_URL}. ${error instanceof Error ? error.message : ''}`.trim(),
      0,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

export function fetchSummary(): Promise<IngestionSummaryResponse> {
  return request<IngestionSummaryResponse>('/api/ingestion/summary');
}

export function fetchProjects(filters: ProjectFilters = {}): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return request<ProjectListResponse>(`/api/ingestion/projects${query ? `?${query}` : ''}`);
}

export function fetchFailures(): Promise<{ items: IngestionFailure[] }> {
  return request<{ items: IngestionFailure[] }>('/api/ingestion/failures');
}

export function startIngestionRun(
  eBiddingOnly = true,
): Promise<{ started: true; message: string }> {
  return request('/api/ingestion/run', {
    method: 'POST',
    body: JSON.stringify({ eBiddingOnly }),
  });
}

/* ------------------------------------------------------------------------- *
 * Company, Client and Experience — the vendor's own record.
 *
 * The wire is snake_case; the domain vocabulary lives in `@torfun/types`. No
 * route below takes a company id: the company is always the caller's own, read
 * from the session on the API side, so the page cannot name someone else's
 * record even by accident.
 * ------------------------------------------------------------------------- */

/** A body-less response — DELETE answers 204, which `response.json()` chokes on. */
async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: headersFor(init),
    });
  } catch (error) {
    throw new ApiError(
      `Cannot reach the API at ${API_URL}. ${error instanceof Error ? error.message : ''}`.trim(),
      0,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
  }
}

export interface CompanyResponse {
  id: string;
  name_th: string;
  tin: string | null;
}

export interface ClientResponse {
  id: string;
  name: string;
  kind: ClientKind;
}

/**
 * `duration_months` is the canonical length; `duration_value` and
 * `duration_unit` are what the person typed. All three are returned so the page
 * can show two years as two years without doing arithmetic of its own.
 */
export interface ExperienceResponse {
  id: string;
  client_id: string;
  project_name: string;
  description: string | null;
  tech_stack: string[];
  target_platforms: TargetPlatform[];
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  duration_months: number | null;
}

export interface CompanyInput {
  name_th: string;
  tin?: string | null;
}

export interface ClientInput {
  name: string;
  kind: ClientKind;
}

export interface ExperienceInput {
  client_id: string;
  project_name: string;
  description?: string | null;
  tech_stack?: string[];
  target_platforms?: TargetPlatform[];
  duration_value?: number | null;
  duration_unit?: DurationUnit | null;
}

export function searchCompanies(q: string): Promise<{ companies: CompanyResponse[] }> {
  return request(`/api/companies/search?q=${encodeURIComponent(q)}`);
}

/** The caller's own company, or `null` when they have not joined one yet. */
export async function fetchMyCompany(): Promise<CompanyResponse | null> {
  try {
    return await request<CompanyResponse>('/api/companies/me');
  } catch (error) {
    // 404 is the documented answer for "no company", not a failure to report.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Creates a company and joins the caller to it in one step. */
export function createCompany(input: CompanyInput): Promise<CompanyResponse> {
  return request('/api/companies', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMyCompany(input: Partial<CompanyInput>): Promise<CompanyResponse> {
  return request('/api/companies/me', { method: 'PATCH', body: JSON.stringify(input) });
}

/** Repoints the caller at an existing company — membership is claimed, not granted. */
export function joinCompany(id: string): Promise<CompanyResponse> {
  return request(`/api/companies/${encodeURIComponent(id)}/join`, { method: 'POST' });
}

export function fetchClients(): Promise<{ clients: ClientResponse[] }> {
  return request('/api/clients');
}

export function createClient(input: ClientInput): Promise<ClientResponse> {
  return request('/api/clients', { method: 'POST', body: JSON.stringify(input) });
}

export function updateClient(id: string, input: Partial<ClientInput>): Promise<ClientResponse> {
  return request(`/api/clients/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** A client that still has experiences answers 409 rather than cascading. */
export function deleteClient(id: string): Promise<void> {
  return requestNoContent(`/api/clients/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Names to suggest for a client. Government names come from agency names the
 * ingestion already holds — public upstream data — so a vendor's spelling
 * matches what the tenders say. Private names come only from the caller's own
 * company.
 */
export function fetchClientSuggestions(
  kind: ClientKind,
  q: string,
): Promise<{ suggestions: string[] }> {
  return request(`/api/clients/suggestions?kind=${kind}&q=${encodeURIComponent(q)}`);
}

export function fetchExperiences(): Promise<{ experiences: ExperienceResponse[] }> {
  return request('/api/experiences');
}

export function createExperience(input: ExperienceInput): Promise<ExperienceResponse> {
  return request('/api/experiences', { method: 'POST', body: JSON.stringify(input) });
}

export function updateExperience(
  id: string,
  input: Partial<ExperienceInput>,
): Promise<ExperienceResponse> {
  return request(`/api/experiences/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteExperience(id: string): Promise<void> {
  return requestNoContent(`/api/experiences/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
