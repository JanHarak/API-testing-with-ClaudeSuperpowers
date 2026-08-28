import { userApi } from '../../src/support/apis';

/**
 * Smoke coverage for the single user endpoint.
 *
 * The purpose of a smoke suite is narrow: prove the call reaches Todoist, is
 * authenticated, and comes back in the shape the OpenAPI document promises. Field-level
 * required/optional/negative coverage is a separate concern.
 */
describe('GET /api/v1/user', () => {
  it('returns the authenticated account profile', async () => {
    const response = await userApi.get<{ id: string; email: string }>();

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('UserJSON');
    expect(response.data.id).toEqual(expect.any(String));
    expect(response.data.email).toContain('@');
  });

  it('refuses an unauthenticated request', async () => {
    const response = await userApi.get({ token: null });

    expect(response).toHaveStatus(401);
  });
});
