import { loadEnv } from './env';

describe('loadEnv', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('reads the token and applies defaults', () => {
    process.env.TODOIST_API_TOKEN = 'abc123';
    delete process.env.TODOIST_BASE_URL;
    delete process.env.TEST_PROJECT_PREFIX;
    delete process.env.HTTP_LOG;

    const cfg = loadEnv();

    expect(cfg.token).toBe('abc123');
    expect(cfg.baseUrl).toBe('https://api.todoist.com');
    expect(cfg.testProjectPrefix).toBe('QA-Automation');
    expect(cfg.httpLog).toBe(false);
  });

  it('throws a helpful error when the token is missing', () => {
    delete process.env.TODOIST_API_TOKEN;
    expect(() => loadEnv()).toThrow(/TODOIST_API_TOKEN/);
  });

  it('strips a trailing slash from the base URL', () => {
    process.env.TODOIST_API_TOKEN = 'abc123';
    process.env.TODOIST_BASE_URL = 'https://api.todoist.com/';
    expect(loadEnv().baseUrl).toBe('https://api.todoist.com');
  });
});
