import type {
  IngestionFailure,
  IngestionOutcome,
  IngestionRecord,
  IngestionState,
  IngestionSummary,
  SoftwareClass,
} from "@torfun/types";

/**
 * Thin client for the ingestion API.
 *
 * The API runs as a separate service, so every call is absolute and errors are
 * surfaced rather than swallowed — a dashboard that silently shows an empty
 * table when the backend is down is worse than one that says so.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type IngestionSummaryResponse = IngestionSummary & { agencies: string[] };

export interface ProjectListResponse {
  items: IngestionRecord[];
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
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    // A network-level failure has no status; distinguish it from a 500 so the
    // UI can say "can't reach the API" rather than "the API is broken".
    throw new ApiError(
      `Cannot reach the API at ${API_URL}. ${error instanceof Error ? error.message : ""}`.trim(),
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
  return request<IngestionSummaryResponse>("/api/ingestion/summary");
}

export function fetchProjects(filters: ProjectFilters = {}): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return request<ProjectListResponse>(`/api/ingestion/projects${query ? `?${query}` : ""}`);
}

export function fetchFailures(): Promise<{ items: IngestionFailure[] }> {
  return request<{ items: IngestionFailure[] }>("/api/ingestion/failures");
}

export function startIngestionRun(eBiddingOnly = true): Promise<{ started: true; message: string }> {
  return request("/api/ingestion/run", {
    method: "POST",
    body: JSON.stringify({ eBiddingOnly }),
  });
}
