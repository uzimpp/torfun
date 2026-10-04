import type {
  ClientKind,
  DurationUnit,
  IngestionFailure,
  IngestionSummary,
  Procurement,
  ProcurementFilters,
  ProcurementListResponse,
  TargetPlatform,
  UserRole,
} from '@torfun/types';

/**
 * Thin client for the torfun API.
 *
 * The API runs as a separate service, so every call is absolute and errors are
 * surfaced rather than swallowed — a dashboard that silently shows an empty
 * table when the backend is down is worse than one that says so.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type IngestionSummaryResponse = IngestionSummary & { agencies: string[] };

export type ProjectListResponse = ProcurementListResponse;
export type ProjectFilters = ProcurementFilters;

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
 * The session is over and cannot be renewed: the API refused the refresh token
 * (revoked, expired, or the account deactivated), or a call still got a 401
 * after a refresh had succeeded. The UI treats this differently from any other
 * failure — the right response is to sign in again, not to retry.
 */
export class SessionEndedError extends ApiError {
  constructor() {
    super('Session ended', 401);
    this.name = 'SessionEndedError';
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

/**
 * How many refreshes have completed. A call remembers the value it was sent
 * under: if a refresh finished while it was in flight, its 401 came from the
 * old cookie, and the right move is to retry it, not to refresh a second time.
 */
let refreshEpoch = 0;
let refreshInFlight: Promise<void> | null = null;

// A network-level failure has no status; distinguish it from a 500 so the UI
// can say "can't reach the API" rather than "the API is broken".
const notReachable = (error: unknown) =>
  new ApiError(
    `Cannot reach the API at ${API_URL}. ${error instanceof Error ? error.message : ''}`.trim(),
    0,
  );

/**
 * Renews the session, at most once at a time.
 *
 * The access cookie lives fifteen minutes and only page navigation used to
 * renew it (`proxy.ts`), so a console left polling went dark at the fifteen-
 * minute mark. Refresh tokens rotate, so two refreshes racing would present the
 * same token twice and end the session; concurrent callers share one promise.
 */
function refreshSession(): Promise<void> {
  refreshInFlight ??= (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      throw notReachable(error);
    }
    if (response.status === 401 || response.status === 403) throw new SessionEndedError();
    if (!response.ok) {
      throw new ApiError(`Session refresh failed: ${response.status}`, response.status);
    }
    refreshEpoch += 1;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * One call to the API, carrying the session cookie and surviving its expiry.
 *
 * A 401 on a data call is answered with a refresh and a single retry. The auth
 * endpoints are exempt — a 401 from a login is a wrong password to show, not a
 * session to renew — and nothing loops: a 401 that survives a refresh means the
 * session is over. Any other non-2xx response is returned for the caller to
 * turn into an error.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const attempt = async (): Promise<Response> => {
    try {
      // The session lives in an httpOnly cookie on a different origin, so every
      // authenticated procurement or administration call must carry it.
      return await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers: headersFor(init),
      });
    } catch (error) {
      throw notReachable(error);
    }
  };

  const sentAt = refreshEpoch;
  const response = await attempt();
  if (response.status !== 401 || path.startsWith('/api/auth/')) return response;

  if (refreshEpoch === sentAt) await refreshSession();
  const retried = await attempt();
  if (retried.status === 401) throw new SessionEndedError();
  return retried;
}

export async function failure(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

export function fetchSummary(): Promise<IngestionSummaryResponse> {
  return request<IngestionSummaryResponse>('/api/ingestion/summary');
}

export function fetchProjects(filters: ProjectFilters = {}): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  const query = params.toString();
  return request<ProjectListResponse>(`/api/tors${query ? `?${query}` : ''}`);
}

export function fetchTor(projectId: string): Promise<Procurement> {
  return request<Procurement>(`/api/tors/${encodeURIComponent(projectId)}`);
}

export async function downloadTor(projectId: string): Promise<Blob> {
  const response = await apiFetch(`/api/tors/${encodeURIComponent(projectId)}/source`);
  if (!response.ok) throw await failure(response);
  return response.blob();
}

export function fetchFailures(): Promise<{ items: IngestionFailure[] }> {
  return request<{ items: IngestionFailure[] }>('/api/ingestion/failures');
}

export function startIngestionRun(): Promise<{ started: true; message: string }> {
  return request('/api/ingestion/run', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Ask the run now going to stop, gracefully. No body, so no JSON content-type:
 * Fastify refuses a request that claims one and sends nothing.
 */
export function stopIngestionRun(): Promise<{ stopping: true }> {
  return request('/api/ingestion/run/stop', { method: 'POST' });
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
export async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await failure(response);
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

/* ------------------------------------------------------------------------- *
 * Accounts — the Site Administrator's view of everyone else (USR-10).
 *
 * Admin-only on the API, enforced for the whole `/api/admin` scope. `credentials`
 * is already included on every call above, which is what carries the session
 * cookie across the origin boundary.
 * ------------------------------------------------------------------------- */

export interface AdminUserResponse {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserPatch {
  role?: UserRole;
  is_active?: boolean;
}

export function fetchAdminUsers(): Promise<{ users: AdminUserResponse[] }> {
  return request('/api/admin/users');
}

/**
 * Grant or revoke the administrator role, or activate or deactivate an account.
 * The API refuses a self-target (403) and the removal of the last active
 * administrator (409); the message it returns is written for the person reading
 * it, so surface it as-is.
 */
export function updateAdminUser(id: string, patch: AdminUserPatch): Promise<AdminUserResponse> {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
