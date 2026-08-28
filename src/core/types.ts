export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export interface ApiResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  raw: string;
  durationMs: number;
}

export interface RequestOptions {
  /** undefined = default token, null = omit the Authorization header entirely */
  token?: string | null;
  /** replaces the whole Authorization header value, for malformed-scheme tests */
  authHeader?: string;
  /** sent verbatim instead of JSON.stringify(body), for malformed-JSON tests */
  rawBody?: string;
  headers?: Record<string, string>;
}

export interface RequestSpec {
  query?: Record<string, unknown>;
  body?: unknown;
  options?: RequestOptions;
}
