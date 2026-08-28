import * as dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  token: string;
  baseUrl: string;
  testProjectPrefix: string;
  httpLog: boolean;
}

export function loadEnv(): EnvConfig {
  const token = process.env.TODOIST_API_TOKEN?.trim();

  if (!token) {
    throw new Error(
      'TODOIST_API_TOKEN is not set. Copy .env.example to .env and fill in a personal API token, ' +
        'or set the TODOIST_API_TOKEN secret in GitHub Actions.',
    );
  }

  return {
    token,
    baseUrl: (process.env.TODOIST_BASE_URL?.trim() || 'https://api.todoist.com').replace(/\/+$/, ''),
    testProjectPrefix: process.env.TEST_PROJECT_PREFIX?.trim() || 'QA-Automation',
    httpLog: process.env.HTTP_LOG === 'true',
  };
}
