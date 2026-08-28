import type { HttpClient } from './HttpClient';
import type { ApiResponse, RequestSpec } from './types';

export abstract class ApiEndpoint {
  protected constructor(
    protected readonly client: HttpClient,
    protected readonly basePath: string,
  ) {}

  protected path(...segments: (string | number)[]): string {
    return [this.basePath, ...segments.map((segment) => String(segment))].join('/');
  }

  protected sendGet<T>(path: string, spec: RequestSpec = {}): Promise<ApiResponse<T>> {
    return this.client.request<T>('GET', path, spec);
  }

  protected sendPost<T>(path: string, spec: RequestSpec = {}): Promise<ApiResponse<T>> {
    return this.client.request<T>('POST', path, spec);
  }

  protected sendDelete<T>(path: string, spec: RequestSpec = {}): Promise<ApiResponse<T>> {
    return this.client.request<T>('DELETE', path, spec);
  }
}
