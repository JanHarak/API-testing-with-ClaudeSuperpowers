import { HttpClient } from './HttpClient';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('HttpClient', () => {
  const fetchMock = jest.fn();
  let client: HttpClient;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new HttpClient({ baseUrl: 'https://api.todoist.com', token: 'secret', retryDelayMs: 0 });
  });

  it('sends the bearer token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: '1' }));

    const res = await client.request<{ id: string }>('GET', '/api/v1/user');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: '1' });
    expect(typeof res.durationMs).toBe('number');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.todoist.com/api/v1/user');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('appends query parameters and skips undefined values', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    await client.request('GET', '/api/v1/tasks', { query: { limit: 5, cursor: undefined, project_id: '7' } });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.todoist.com/api/v1/tasks?limit=5&project_id=7');
  });

  it('does not throw on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));

    const res = await client.request('POST', '/api/v1/tasks', { body: {} });

    expect(res.status).toBe(400);
    expect(res.raw).toBe('Bad Request');
    expect(res.data).toBeNull();
  });

  it('omits the Authorization header when token is null', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));

    await client.request('GET', '/api/v1/user', { options: { token: null } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends rawBody verbatim', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 400 }));

    await client.request('POST', '/api/v1/tasks', { options: { rawBody: '{"content":' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"content":');
  });

  it('retries once on 429 and returns the successful response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ id: '1' }));

    const res = await client.request<{ id: string }>('GET', '/api/v1/user');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('gives up after the retry budget and returns the last response', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    const res = await client.request('GET', '/api/v1/user');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(res.status).toBe(503);
  });

  it('returns 204 responses with null data', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await client.request('DELETE', '/api/v1/tasks/1');

    expect(res.status).toBe(204);
    expect(res.data).toBeNull();
  });
});
