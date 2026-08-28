import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ApiResponse, HttpMethod, RequestSpec } from './types';

export interface HttpClientConfig {
  baseUrl: string;
  token: string;
  maxRetries?: number;
  retryDelayMs?: number;
  logFile?: string;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class HttpClient {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly config: HttpClientConfig) {
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }

  async request<T = unknown>(method: HttpMethod, path: string, spec: RequestSpec = {}): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, spec.query);
    const init = this.buildInit(method, spec);

    let response!: Response;
    let attempt = 0;
    const startedAt = Date.now();

    for (;;) {
      response = await fetch(url, init);

      if (!isRetryable(response.status) || attempt >= this.maxRetries) {
        break;
      }

      await this.sleep(this.retryAfterMs(response, attempt));
      attempt += 1;
    }

    const raw = await response.text();
    const result: ApiResponse<T> = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: this.parse<T>(raw),
      raw,
      durationMs: Date.now() - startedAt,
    };

    this.log(method, url, result);
    return result;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(path, `${this.config.baseUrl}/`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.append(key, String(value));
    }

    return url.toString();
  }

  private buildInit(method: HttpMethod, spec: RequestSpec): RequestInit {
    const options = spec.options ?? {};
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

    if (options.authHeader !== undefined) {
      headers.Authorization = options.authHeader;
    } else if (options.token !== null) {
      headers.Authorization = `Bearer ${options.token ?? this.config.token}`;
    }

    const body = options.rawBody !== undefined ? options.rawBody : spec.body !== undefined ? JSON.stringify(spec.body) : undefined;

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    return { method, headers, body };
  }

  private parse<T>(raw: string): T {
    if (raw.length === 0) {
      return null as T;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null as T;
    }
  }

  private retryAfterMs(response: Response, attempt: number): number {
    const header = response.headers.get('retry-after');
    const parsed = header === null ? Number.NaN : Number(header);

    if (!Number.isNaN(parsed)) {
      return parsed * 1000;
    }

    return this.retryDelayMs * 2 ** attempt;
  }

  private sleep(ms: number): Promise<void> {
    return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(method: HttpMethod, url: string, response: ApiResponse<unknown>): void {
    if (!this.config.logFile) {
      return;
    }

    mkdirSync(dirname(this.config.logFile), { recursive: true });
    appendFileSync(
      this.config.logFile,
      `${new Date().toISOString()} ${method} ${url} -> ${response.status} (${response.durationMs}ms)\n`,
      'utf8',
    );
  }
}
