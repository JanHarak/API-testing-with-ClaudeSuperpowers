import { ApiEndpoint } from '../core/ApiEndpoint';
import type { HttpClient } from '../core/HttpClient';
import type { ApiResponse, RequestOptions } from '../core/types';

/** GET /api/v1/user - the only user operation in scope. */
export class UserApi extends ApiEndpoint {
  constructor(client: HttpClient) {
    super(client, '/api/v1/user');
  }

  get<T = unknown>(options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.basePath, { options });
  }
}
