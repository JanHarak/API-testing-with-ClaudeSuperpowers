import { ApiEndpoint } from '../core/ApiEndpoint';
import type { HttpClient } from '../core/HttpClient';
import type { ApiResponse, RequestOptions } from '../core/types';

/**
 * The five comment operations in scope. Todoist uses POST for updates, not PUT or
 * PATCH, so `update` posts to the item path.
 *
 * `payload` is deliberately `unknown`: the negative suites must be able to send bodies
 * that a typed interface would reject at compile time.
 */
export class CommentsApi extends ApiEndpoint {
  constructor(client: HttpClient) {
    super(client, '/api/v1/comments');
  }

  create<T = unknown>(payload: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.basePath, { body: payload, options });
  }

  list<T = unknown>(
    query?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.basePath, { query, options });
  }

  getById<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.path(id), { options });
  }

  update<T = unknown>(
    id: string,
    payload: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.path(id), { body: payload, options });
  }

  delete<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendDelete<T>(this.path(id), { options });
  }
}
