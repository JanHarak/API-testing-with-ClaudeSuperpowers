# Todoist API Test Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-driven Jest + TypeScript regression suite covering 26 Todoist REST API v1 endpoints, with generated per-test-case documentation and a GitHub Actions run every day at 07:00 Europe/Prague.

**Architecture:** Thin test files read JSON test cases and drive one service-object class per resource (the page-object equivalent for APIs). Those classes sit on a single `HttpClient` that never throws on non-2xx, so status codes stay assertable. Responses are validated with AJV against the vendored OpenAPI 3.1 spec.

**Tech Stack:** Node 20 (native `fetch`), TypeScript 5 strict, Jest 29 + ts-jest, ajv 8 (`ajv/dist/2020`) + ajv-formats, dotenv, jest-junit, jest-html-reporters, ESLint + Prettier.

**Spec:** [docs/superpowers/specs/2026-08-28-todoist-api-testing-design.md](../specs/2026-08-28-todoist-api-testing-design.md)

## Global Constraints

- Base URL: `https://api.todoist.com`, all endpoints under `/api/v1`.
- Auth: `Authorization: Bearer <TODOIST_API_TOKEN>`; token comes from `.env` locally and from the `TODOIST_API_TOKEN` GitHub secret in CI. `.env` is never committed.
- Todoist uses `POST` for updates, not `PUT`/`PATCH`.
- Jest runs with `maxWorkers: 1`. The API is rate limited and all tests share one account.
- `HttpClient` never throws on non-2xx. Status is always an assertion target.
- Expected status codes for negative cases are **never guessed**. They are recorded by `scripts/probe-negatives.ts` against the live API and copied into the JSON data files. Deviations from the OpenAPI spec are noted in the generated docs.
- Test data lives inside one project named `QA-Automation-<ISO timestamp>` created by `globalSetup` and deleted by `globalTeardown`. Labels are account-global and are cleaned by the `qa-auto-` name prefix.
- Code, test titles and commit messages in English. Generated test-case documentation in Czech.
- Node 20, TypeScript `strict: true`, no `any` in `src/` except where a negative case deliberately sends an invalid payload (typed `unknown`).
- Account under test is free (`is_premium: false`). Premium endpoints are out of scope.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/types.ts` | `ApiResponse`, `RequestOptions`, `TestCase`, `TestSuite`, `HttpMethod` |
| `src/core/HttpClient.ts` | fetch wrapper, retry on 429/5xx, timing, raw-body escape hatch |
| `src/core/SchemaValidator.ts` | AJV 2020 over the vendored OpenAPI spec, compiled-schema cache |
| `src/core/ApiEndpoint.ts` | abstract base: holds client, builds paths |
| `src/endpoints/UserApi.ts` | `GET /user` |
| `src/endpoints/ProjectsApi.ts` | projects CRUD |
| `src/endpoints/SectionsApi.ts` | sections CRUD |
| `src/endpoints/TasksApi.ts` | tasks CRUD |
| `src/endpoints/CommentsApi.ts` | comments CRUD |
| `src/endpoints/LabelsApi.ts` | labels CRUD |
| `src/support/env.ts` | loads and validates `.env` |
| `src/support/testRun.ts` | reads/writes `.tmp/test-run.json` across processes |
| `src/support/TestContext.ts` | run-scoped fixture registry used by the placeholder resolver |
| `src/support/TestDataFactory.ts` | unique names, placeholder resolution |
| `src/support/loadTestCases.ts` | reads `data/testcases/**` into `TestSuite[]` |
| `src/support/runSuite.ts` | `resolveCase` and `assertCase`, the only assertion path used by test files |
| `src/support/matchers.ts` | `toHaveStatus`, `toMatchApiSchema` |
| `src/support/globalSetup.ts` | creates the run project, cleans stale runs |
| `src/support/globalTeardown.ts` | deletes the run project and `qa-auto-` labels |
| `src/support/apis.ts` | one shared instance of every endpoint class |
| `data/openapi/todoist-openapi.json` | vendored spec, source of truth for schemas |
| `data/testcases/<resource>/<operation>.<kind>.json` | test data |
| `scripts/probe-negatives.ts` | records real API behaviour for negative cases |
| `scripts/generate-test-docs.ts` | generates `docs/test-cases/**`, `--check` mode for CI |
| `scripts/update-openapi.ts` | refreshes the vendored spec |
| `tests/<resource>/<operation>.test.ts` | the data-driven test files |
| `.github/workflows/api-tests.yml` | scheduled run with the Prague-time guard |

## Shared Negative Matrix

Every endpoint instantiates the applicable rows of this matrix in its
`*.negative.json` file. Case IDs follow
`TC-<RESOURCE>-<OPERATION>-NEG-<nnn>`; the matrix key goes in the case's
`matrixKey` field so the docs generator can group them.

| Key | Applies to | What is sent |
|---|---|---|
| `AUTH_MISSING` | every endpoint | no `Authorization` header |
| `AUTH_INVALID` | every endpoint | `Bearer 0000000000000000000000000000000000000000` |
| `AUTH_MALFORMED` | every endpoint | `Authorization: NotBearer <token>` |
| `ID_NONEXISTENT` | every `{id}` endpoint | syntactically valid but unused ID |
| `ID_MALFORMED` | every `{id}` endpoint | `!!!not-an-id!!!` |
| `BODY_MALFORMED` | every endpoint with a body | raw body `{"content":` |
| `BODY_NOT_OBJECT` | every endpoint with a body | raw body `"just a string"` |
| `PAGE_LIMIT_ZERO` | every list endpoint | `limit=0` |
| `PAGE_LIMIT_OVER_MAX` | every list endpoint | `limit=201` (spec max is 200) |
| `PAGE_LIMIT_NEGATIVE` | every list endpoint | `limit=-1` |
| `PAGE_LIMIT_TYPE` | every list endpoint | `limit=abc` |
| `PAGE_CURSOR_INVALID` | every list endpoint | `cursor=not-a-real-cursor` |

Field-level negatives (missing required field, empty string, wrong type,
over-length, out-of-range enum) are listed per endpoint in the resource
tasks below.

---

## Task 1: Project scaffolding and environment configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.scripts.json`, `jest.config.ts`, `jest.unit.config.ts`, `.env`, `.env.example`, `.prettierrc`, `.eslintrc.json`
- Create: `src/support/env.ts`
- Create: `scripts/update-openapi.ts`
- Create: `data/openapi/todoist-openapi.json`
- Modify: `.gitignore`
- Test: `src/support/env.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `loadEnv(): EnvConfig` from `src/support/env.ts`
  - `interface EnvConfig { token: string; baseUrl: string; testProjectPrefix: string; httpLog: boolean }`
  - npm scripts `test`, `test:unit`, `docs:generate`, `docs:check`, `probe`, `spec:update`, `lint`, `format`

- [ ] **Step 1: Initialise the package and install dependencies**

```bash
npm init -y
npm pkg set name="todoist-api-tests" version="1.0.0" private=true
npm pkg set engines.node=">=20"
npm i -D typescript@^5.6 ts-node@^10.9 @types/node@^20 \
  jest@^29.7 ts-jest@^29.2 @types/jest@^29.5 \
  jest-junit@^16.0 jest-html-reporters@^3.1 \
  ajv@^8.17 ajv-formats@^3.0 dotenv@^16.4 \
  eslint@^8.57 @typescript-eslint/parser@^7.18 @typescript-eslint/eslint-plugin@^7.18 prettier@^3.3
```

- [ ] **Step 2: Add npm scripts**

```bash
npm pkg set scripts.test="jest --config jest.config.ts"
npm pkg set scripts.test:unit="jest --config jest.unit.config.ts"
npm pkg set scripts.docs:generate="ts-node --project tsconfig.scripts.json scripts/generate-test-docs.ts"
npm pkg set scripts.docs:check="ts-node --project tsconfig.scripts.json scripts/generate-test-docs.ts --check"
npm pkg set scripts.probe="ts-node --project tsconfig.scripts.json scripts/probe-negatives.ts"
npm pkg set scripts.spec:update="ts-node --project tsconfig.scripts.json scripts/update-openapi.ts"
npm pkg set scripts.lint="eslint . --ext .ts"
npm pkg set scripts.format="prettier --write ."
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "types": ["node", "jest"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": { "@src/*": ["src/*"] }
  },
  "include": ["src", "tests", "scripts", "jest.config.ts", "jest.unit.config.ts"]
}
```

- [ ] **Step 4: Write `tsconfig.scripts.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["scripts", "src"]
}
```

- [ ] **Step 5: Write `jest.config.ts` (integration suite)**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  maxWorkers: 1,
  testTimeout: 30000,
  globalSetup: '<rootDir>/src/support/globalSetup.ts',
  globalTeardown: '<rootDir>/src/support/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/support/matchers.ts'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml', classNameTemplate: '{classname}', titleTemplate: '{title}' }],
    ['jest-html-reporters', { publicPath: 'reports/html', filename: 'index.html', includeFailureMsg: true, includeConsoleLog: true, pageTitle: 'Todoist API tests' }],
  ],
};

export default config;
```

- [ ] **Step 6: Write `jest.unit.config.ts` (no network, no global setup)**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testTimeout: 10000,
};

export default config;
```

- [ ] **Step 7: Write `.env.example` and `.env`**

`.env.example` (committed):

```
TODOIST_API_TOKEN=your_token_here
TODOIST_BASE_URL=https://api.todoist.com
TEST_PROJECT_PREFIX=QA-Automation
HTTP_LOG=false
```

`.env` (never committed) is the same file with the real personal API token
in `TODOIST_API_TOKEN`. Take the value from Todoist, Settings, Integrations,
Developer, Personal API token. Never paste the token into any tracked file,
this plan included.

- [ ] **Step 8: Confirm `.gitignore` covers the secrets and outputs**

Run `grep -nE '^\.env$|^\.env' .gitignore`. The stock Node `.gitignore`
already ignores `.env`. Append the entries that are missing:

```
# Project specific
.tmp/
reports/
```

Then verify nothing sensitive is staged: `git check-ignore -v .env`
must print a matching rule.

- [ ] **Step 9: Write the failing test for the env loader**

`src/support/env.spec.ts`:

```ts
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
```

- [ ] **Step 10: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/support/env.spec.ts`
Expected: FAIL, `Cannot find module './env'`.

- [ ] **Step 11: Implement `src/support/env.ts`**

```ts
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
```

- [ ] **Step 12: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/support/env.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 13: Write `scripts/update-openapi.ts` and vendor the spec**

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SPEC_URL = 'https://developer.todoist.com/openapi.json';
const TARGET = resolve(__dirname, '..', 'data', 'openapi', 'todoist-openapi.json');

async function main(): Promise<void> {
  const res = await fetch(SPEC_URL);

  if (!res.ok) {
    throw new Error(`Failed to download the OpenAPI spec: HTTP ${res.status}`);
  }

  const spec: unknown = await res.json();
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`Saved ${TARGET}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

Run: `npm run spec:update`
Expected: `data/openapi/todoist-openapi.json` exists and
`node -e "console.log(Object.keys(require('./data/openapi/todoist-openapi.json').paths).length)"` prints `76`.

- [ ] **Step 14: Add lint and format configuration**

`.prettierrc`:

```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 110 }
```

`.eslintrc.json`:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "env": { "node": true, "jest": true },
  "ignorePatterns": ["dist", "node_modules", "reports", "data/openapi"]
}
```

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.scripts.json \
  jest.config.ts jest.unit.config.ts .env.example .gitignore .prettierrc .eslintrc.json \
  src/support/env.ts src/support/env.spec.ts scripts/update-openapi.ts data/openapi/todoist-openapi.json
git commit -m "chore: scaffold TypeScript Jest project and vendor the Todoist OpenAPI spec"
```

Confirm `.env` is absent from `git status` output before committing.

---

## Task 2: Schema validator over the OpenAPI spec

**Files:**
- Create: `src/core/SchemaValidator.ts`
- Test: `src/core/SchemaValidator.spec.ts`

**Interfaces:**
- Consumes: `data/openapi/todoist-openapi.json` from Task 1
- Produces:
  - `class SchemaValidator` with `validate(schemaName: string, data: unknown): ValidationResult`
  - `interface ValidationResult { valid: boolean; errors: string[] }`
  - `const schemaValidator: SchemaValidator` (shared singleton)

- [ ] **Step 1: Write the failing test**

`src/core/SchemaValidator.spec.ts`:

```ts
import { schemaValidator } from './SchemaValidator';

describe('SchemaValidator', () => {
  it('accepts a minimal valid label payload', () => {
    const result = schemaValidator.validate('LabelRestView', {
      id: '1',
      name: 'qa-auto-label',
      color: 'charcoal',
      order: 1,
      is_favorite: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('reports the failing property path', () => {
    const result = schemaValidator.validate('LabelRestView', { id: 1 });

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/\/id/);
  });

  it('throws a clear error for an unknown schema name', () => {
    expect(() => schemaValidator.validate('NoSuchSchema', {})).toThrow(/NoSuchSchema/);
  });

  it('compiles every schema the suite relies on', () => {
    const names = [
      'UserJSON',
      'ItemSyncView',
      'AnyProjectSyncViewResponse',
      'SectionSyncView',
      'NoteSyncView',
      'LabelRestView',
      'PaginatedList_ItemSyncView_',
      'PaginatedList_AnyProjectSyncViewResponse_',
      'PaginatedList_SectionSyncView_',
      'PaginatedList_NoteSyncView_',
      'PaginatedList_LabelRestView_',
    ];

    for (const name of names) {
      expect(() => schemaValidator.validate(name, {})).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/core/SchemaValidator.spec.ts`
Expected: FAIL, `Cannot find module './SchemaValidator'`.

- [ ] **Step 3: Implement `src/core/SchemaValidator.ts`**

```ts
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import openApiSpec from '../../data/openapi/todoist-openapi.json';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SPEC_ID = 'openapi.json';

export class SchemaValidator {
  private readonly ajv: Ajv2020;
  private readonly cache = new Map<string, ValidateFunction>();
  private readonly available: Set<string>;

  constructor(spec: Record<string, unknown> = openApiSpec as Record<string, unknown>) {
    this.ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
    addFormats(this.ajv);
    this.ajv.addSchema({ ...spec, $id: SPEC_ID });

    const components = spec.components as { schemas?: Record<string, unknown> } | undefined;
    this.available = new Set(Object.keys(components?.schemas ?? {}));
  }

  validate(schemaName: string, data: unknown): ValidationResult {
    const validateFn = this.compile(schemaName);
    const valid = validateFn(data) as boolean;

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (validateFn.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    );

    return { valid: false, errors };
  }

  private compile(schemaName: string): ValidateFunction {
    const cached = this.cache.get(schemaName);
    if (cached) {
      return cached;
    }

    if (!this.available.has(schemaName)) {
      throw new Error(
        `Unknown OpenAPI schema "${schemaName}". Check data/openapi/todoist-openapi.json ` +
          'or refresh it with npm run spec:update.',
      );
    }

    const validateFn = this.ajv.compile({ $ref: `${SPEC_ID}#/components/schemas/${schemaName}` });
    this.cache.set(schemaName, validateFn);
    return validateFn;
  }
}

export const schemaValidator = new SchemaValidator();
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/core/SchemaValidator.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/SchemaValidator.ts src/core/SchemaValidator.spec.ts
git commit -m "feat: validate responses against the vendored OpenAPI schemas"
```

---

## Task 3: HttpClient

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/HttpClient.ts`
- Test: `src/core/HttpClient.spec.ts`

**Interfaces:**
- Consumes: `loadEnv()` from Task 1
- Produces:
  - `type HttpMethod = 'GET' | 'POST' | 'DELETE'`
  - `interface ApiResponse<T> { status: number; statusText: string; headers: Record<string, string>; data: T; raw: string; durationMs: number }`
  - `interface RequestOptions { token?: string | null; authHeader?: string; rawBody?: string; headers?: Record<string, string> }`
  - `interface RequestSpec { query?: Record<string, unknown>; body?: unknown; options?: RequestOptions }`
  - `class HttpClient` with `request<T>(method, path, spec?): Promise<ApiResponse<T>>`

Semantics that later tasks depend on:
`options.token === null` sends no `Authorization` header;
`options.authHeader` replaces the whole header value;
`options.rawBody` is sent verbatim so malformed JSON can be tested.

- [ ] **Step 1: Write `src/core/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

`src/core/HttpClient.spec.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/core/HttpClient.spec.ts`
Expected: FAIL, `Cannot find module './HttpClient'`.

- [ ] **Step 4: Implement `src/core/HttpClient.ts`**

```ts
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

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

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

      if (!RETRYABLE.has(response.status) || attempt >= this.maxRetries) {
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
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/core/HttpClient.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/HttpClient.ts src/core/HttpClient.spec.ts
git commit -m "feat: add HttpClient with retry, raw-body and auth escape hatches"
```

---

## Task 4: ApiEndpoint base and custom Jest matchers

**Files:**
- Create: `src/core/ApiEndpoint.ts`
- Create: `src/support/matchers.ts`
- Test: `src/support/matchers.spec.ts`

**Interfaces:**
- Consumes: `HttpClient`, `ApiResponse`, `RequestSpec` (Task 3), `schemaValidator` (Task 2)
- Produces:
  - `abstract class ApiEndpoint` with `protected readonly client`, `protected readonly basePath`, and `protected get/post/delete` helpers
  - matchers `expect(res).toHaveStatus(code)` and `expect(res.data).toMatchApiSchema(name)`

- [ ] **Step 1: Implement `src/core/ApiEndpoint.ts`**

```ts
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
```

The helpers are deliberately named `sendGet`/`sendPost`/`sendDelete` rather
than `get`/`post`/`delete`. `UserApi` exposes a public `get()` and
`LabelsApi` a public `delete()`; a protected base member of the same name
would be an illegal override under TypeScript's stricter member rules.

`path()` accepts raw strings so malformed-ID negative cases can be passed
through unchanged. Values are URL-encoded by `HttpClient` only for query
parameters, so path segments containing `!!!` reach the API verbatim,
which is exactly what `ID_MALFORMED` needs.

- [ ] **Step 2: Write the failing matcher test**

`src/support/matchers.spec.ts`:

```ts
import './matchers';
import type { ApiResponse } from '../core/types';

function response(status: number, data: unknown = null): ApiResponse {
  return { status, statusText: '', headers: {}, data, raw: JSON.stringify(data ?? ''), durationMs: 1 };
}

describe('custom matchers', () => {
  it('toHaveStatus passes on a matching status', () => {
    expect(response(200)).toHaveStatus(200);
  });

  it('toHaveStatus reports the body when the status differs', () => {
    expect(() => expect(response(400, { error: 'nope' })).toHaveStatus(200)).toThrow(/400.*nope/s);
  });

  it('toMatchApiSchema passes for a valid payload', () => {
    expect({ id: '1', name: 'qa-auto', color: 'charcoal', order: 1, is_favorite: false }).toMatchApiSchema(
      'LabelRestView',
    );
  });

  it('toMatchApiSchema lists the failing paths', () => {
    expect(() => expect({ id: 1 }).toMatchApiSchema('LabelRestView')).toThrow(/\/id/);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/support/matchers.spec.ts`
Expected: FAIL, `Cannot find module './matchers'`.

- [ ] **Step 4: Implement `src/support/matchers.ts`**

```ts
import { schemaValidator } from '../core/SchemaValidator';
import type { ApiResponse } from '../core/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveStatus(expected: number): R;
      toMatchApiSchema(schemaName: string): R;
    }
  }
}

expect.extend({
  toHaveStatus(received: ApiResponse, expected: number) {
    const pass = received.status === expected;
    const body = received.raw.length > 800 ? `${received.raw.slice(0, 800)}...` : received.raw;

    return {
      pass,
      message: () =>
        pass
          ? `Expected status not to be ${expected}.`
          : `Expected status ${expected} but received ${received.status}.\nResponse body: ${body}`,
    };
  },

  toMatchApiSchema(received: unknown, schemaName: string) {
    const result = schemaValidator.validate(schemaName, received);

    return {
      pass: result.valid,
      message: () =>
        result.valid
          ? `Expected the payload not to match schema ${schemaName}.`
          : `Payload does not match schema ${schemaName}:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`,
    };
  },
});

export {};
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/support/matchers.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/ApiEndpoint.ts src/support/matchers.ts src/support/matchers.spec.ts
git commit -m "feat: add ApiEndpoint base class and toHaveStatus/toMatchApiSchema matchers"
```

---

## Task 5: Endpoint classes for all six resources

**Files:**
- Create: `src/endpoints/UserApi.ts`, `ProjectsApi.ts`, `SectionsApi.ts`, `TasksApi.ts`, `CommentsApi.ts`, `LabelsApi.ts`
- Create: `src/support/apis.ts`
- Test: `src/endpoints/endpoints.spec.ts`

**Interfaces:**
- Consumes: `ApiEndpoint` (Task 4), `HttpClient` (Task 3), `loadEnv` (Task 1)
- Produces:
  - `UserApi.get(options?)`
  - `ProjectsApi.create/list/getById/update/delete`
  - `SectionsApi.create/list/getById/update/delete`
  - `TasksApi.create/list/getById/update/delete`
  - `CommentsApi.create/list/getById/update/delete`
  - `LabelsApi.create/list/getById/update/delete`
  - `src/support/apis.ts` exporting `httpClient`, `userApi`, `projectsApi`, `sectionsApi`, `tasksApi`, `commentsApi`, `labelsApi`

Every `create`/`update` takes `payload: unknown` so invalid payloads can be
sent. Every method takes an optional trailing `options?: RequestOptions`.
`list` takes `query?: Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

`src/endpoints/endpoints.spec.ts`:

```ts
import { HttpClient } from '../core/HttpClient';
import { TasksApi } from './TasksApi';
import { ProjectsApi } from './ProjectsApi';
import { SectionsApi } from './SectionsApi';
import { CommentsApi } from './CommentsApi';
import { LabelsApi } from './LabelsApi';
import { UserApi } from './UserApi';

describe('endpoint classes build the documented paths', () => {
  const request = jest.fn().mockResolvedValue({ status: 200, data: null });
  const client = { request } as unknown as HttpClient;

  beforeEach(() => request.mockClear());

  it.each([
    ['user get', () => new UserApi(client).get(), 'GET', '/api/v1/user'],
    ['tasks create', () => new TasksApi(client).create({ content: 'x' }), 'POST', '/api/v1/tasks'],
    ['tasks list', () => new TasksApi(client).list({ limit: 5 }), 'GET', '/api/v1/tasks'],
    ['tasks getById', () => new TasksApi(client).getById('7'), 'GET', '/api/v1/tasks/7'],
    ['tasks update', () => new TasksApi(client).update('7', { content: 'y' }), 'POST', '/api/v1/tasks/7'],
    ['tasks delete', () => new TasksApi(client).delete('7'), 'DELETE', '/api/v1/tasks/7'],
    ['projects create', () => new ProjectsApi(client).create({ name: 'x' }), 'POST', '/api/v1/projects'],
    ['projects getById', () => new ProjectsApi(client).getById('7'), 'GET', '/api/v1/projects/7'],
    ['sections create', () => new SectionsApi(client).create({ name: 'x' }), 'POST', '/api/v1/sections'],
    ['sections getById', () => new SectionsApi(client).getById('7'), 'GET', '/api/v1/sections/7'],
    ['comments create', () => new CommentsApi(client).create({ content: 'x' }), 'POST', '/api/v1/comments'],
    ['comments getById', () => new CommentsApi(client).getById('7'), 'GET', '/api/v1/comments/7'],
    ['labels create', () => new LabelsApi(client).create({ name: 'x' }), 'POST', '/api/v1/labels'],
    ['labels getById', () => new LabelsApi(client).getById('7'), 'GET', '/api/v1/labels/7'],
  ])('%s', async (_name, call, method, path) => {
    await call();
    expect(request).toHaveBeenCalledWith(method, path, expect.anything());
  });

  it('passes the query through on list', async () => {
    await new TasksApi(client).list({ project_id: '9', limit: 10 });
    expect(request).toHaveBeenCalledWith('GET', '/api/v1/tasks', expect.objectContaining({ query: { project_id: '9', limit: 10 } }));
  });

  it('passes request options through', async () => {
    await new TasksApi(client).getById('7', { token: null });
    expect(request).toHaveBeenCalledWith('GET', '/api/v1/tasks/7', expect.objectContaining({ options: { token: null } }));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/endpoints/endpoints.spec.ts`
Expected: FAIL, `Cannot find module './TasksApi'`.

- [ ] **Step 3: Implement `src/endpoints/TasksApi.ts`**

```ts
import { ApiEndpoint } from '../core/ApiEndpoint';
import type { HttpClient } from '../core/HttpClient';
import type { ApiResponse, RequestOptions } from '../core/types';

export class TasksApi extends ApiEndpoint {
  constructor(client: HttpClient) {
    super(client, '/api/v1/tasks');
  }

  create<T = unknown>(payload: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.basePath, { body: payload, options });
  }

  list<T = unknown>(query: Record<string, unknown> = {}, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.basePath, { query, options });
  }

  getById<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.path(id), { options });
  }

  update<T = unknown>(id: string, payload: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.path(id), { body: payload, options });
  }

  delete<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendDelete<T>(this.path(id), { options });
  }
}
```

- [ ] **Step 4: Implement the four sibling CRUD classes**

`ProjectsApi.ts`, `SectionsApi.ts`, `CommentsApi.ts` and `LabelsApi.ts` are
the same class body with a different `basePath`. Write each file in full:

```ts
import { ApiEndpoint } from '../core/ApiEndpoint';
import type { HttpClient } from '../core/HttpClient';
import type { ApiResponse, RequestOptions } from '../core/types';

export class ProjectsApi extends ApiEndpoint {
  constructor(client: HttpClient) {
    super(client, '/api/v1/projects');
  }

  create<T = unknown>(payload: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.basePath, { body: payload, options });
  }

  list<T = unknown>(query: Record<string, unknown> = {}, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.basePath, { query, options });
  }

  getById<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.path(id), { options });
  }

  update<T = unknown>(id: string, payload: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendPost<T>(this.path(id), { body: payload, options });
  }

  delete<T = unknown>(id: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendDelete<T>(this.path(id), { options });
  }
}
```

Repeat verbatim for `SectionsApi` (`'/api/v1/sections'`), `CommentsApi`
(`'/api/v1/comments'`) and `LabelsApi` (`'/api/v1/labels'`), changing only
the class name and the `basePath` string.

- [ ] **Step 5: Implement `src/endpoints/UserApi.ts`**

```ts
import { ApiEndpoint } from '../core/ApiEndpoint';
import type { HttpClient } from '../core/HttpClient';
import type { ApiResponse, RequestOptions } from '../core/types';

export class UserApi extends ApiEndpoint {
  constructor(client: HttpClient) {
    super(client, '/api/v1/user');
  }

  get<T = unknown>(options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.sendGet<T>(this.basePath, { options });
  }
}
```

- [ ] **Step 6: Implement `src/support/apis.ts`**

```ts
import { HttpClient } from '../core/HttpClient';
import { CommentsApi } from '../endpoints/CommentsApi';
import { LabelsApi } from '../endpoints/LabelsApi';
import { ProjectsApi } from '../endpoints/ProjectsApi';
import { SectionsApi } from '../endpoints/SectionsApi';
import { TasksApi } from '../endpoints/TasksApi';
import { UserApi } from '../endpoints/UserApi';
import { loadEnv } from './env';

const env = loadEnv();

export const httpClient = new HttpClient({
  baseUrl: env.baseUrl,
  token: env.token,
  logFile: env.httpLog ? 'reports/http.log' : undefined,
});

export const userApi = new UserApi(httpClient);
export const projectsApi = new ProjectsApi(httpClient);
export const sectionsApi = new SectionsApi(httpClient);
export const tasksApi = new TasksApi(httpClient);
export const commentsApi = new CommentsApi(httpClient);
export const labelsApi = new LabelsApi(httpClient);
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/endpoints/endpoints.spec.ts`
Expected: PASS, 16 tests.

- [ ] **Step 8: Commit**

```bash
git add src/endpoints src/support/apis.ts
git commit -m "feat: add service objects for user, projects, sections, tasks, comments and labels"
```

---

## Task 6: Run isolation, fixtures and cleanup

**Files:**
- Create: `src/support/testRun.ts`
- Create: `src/support/TestContext.ts`
- Create: `src/support/TestDataFactory.ts`
- Create: `src/support/globalSetup.ts`
- Create: `src/support/globalTeardown.ts`
- Test: `src/support/TestDataFactory.spec.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: `projectsApi`, `labelsApi` (Task 5)
- Produces:
  - `interface TestRunState { runId: string; projectId: string; projectName: string; startedAt: string }`
  - `saveTestRun(state): void`, `loadTestRun(): TestRunState`
  - `class TestContext` with `projectId`, `runId`, `set(key, value)`, `get(key)`, `require(key)`
  - `uniqueName(prefix): string`, `resolvePlaceholders<T>(value: T, ctx: TestContext): T`
  - `NON_EXISTENT_ID = '6X4rfFVWjhSj9Vc9'`, `MALFORMED_ID = '!!!not-an-id!!!'`

- [ ] **Step 1: Implement `src/support/testRun.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface TestRunState {
  runId: string;
  projectId: string;
  projectName: string;
  startedAt: string;
}

const STATE_FILE = resolve(__dirname, '..', '..', '.tmp', 'test-run.json');

export function saveTestRun(state: TestRunState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function loadTestRun(): TestRunState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as TestRunState;
  } catch {
    throw new Error(
      `Missing ${STATE_FILE}. Run the suite through "npm test" so globalSetup can create the test project.`,
    );
  }
}
```

- [ ] **Step 2: Implement `src/support/TestContext.ts`**

```ts
import { loadTestRun, type TestRunState } from './testRun';

export class TestContext {
  readonly run: TestRunState;
  private readonly fixtures = new Map<string, string>();

  constructor(run: TestRunState = loadTestRun()) {
    this.run = run;
  }

  get projectId(): string {
    return this.run.projectId;
  }

  get runId(): string {
    return this.run.runId;
  }

  set(key: string, value: string): void {
    this.fixtures.set(key, value);
  }

  get(key: string): string | undefined {
    return key === 'projectId' ? this.projectId : this.fixtures.get(key);
  }

  require(key: string): string {
    const value = this.get(key);

    if (value === undefined) {
      throw new Error(`Placeholder {{${key}}} is not available. Create the fixture in beforeAll first.`);
    }

    return value;
  }
}
```

- [ ] **Step 3: Write the failing test for the data factory**

`src/support/TestDataFactory.spec.ts`:

```ts
import { TestContext } from './TestContext';
import { MALFORMED_ID, NON_EXISTENT_ID, resolvePlaceholders, uniqueName } from './TestDataFactory';

describe('TestDataFactory', () => {
  const ctx = new TestContext({
    runId: 'run1',
    projectId: 'P1',
    projectName: 'QA-Automation-run1',
    startedAt: '2026-08-28T05:00:00.000Z',
  });
  ctx.set('taskId', 'T1');

  it('generates prefixed unique names', () => {
    const a = uniqueName('task');
    const b = uniqueName('task');
    expect(a).toMatch(/^qa-auto-task-[a-z0-9]{8}$/);
    expect(a).not.toBe(b);
  });

  it('resolves known placeholders in nested structures', () => {
    const resolved = resolvePlaceholders({ project_id: '{{projectId}}', nested: [{ id: '{{taskId}}' }] }, ctx);
    expect(resolved).toEqual({ project_id: 'P1', nested: [{ id: 'T1' }] });
  });

  it('resolves the id placeholders', () => {
    expect(resolvePlaceholders('{{nonExistentId}}', ctx)).toBe(NON_EXISTENT_ID);
    expect(resolvePlaceholders('{{malformedId}}', ctx)).toBe(MALFORMED_ID);
  });

  it('expands {{longString:N}} to exactly N characters', () => {
    expect(resolvePlaceholders('{{longString:5}}', ctx)).toHaveLength(5);
  });

  it('keeps the same {{uniqueName}} value within one payload', () => {
    const resolved = resolvePlaceholders({ a: '{{uniqueName}}', b: '{{uniqueName}}' }, ctx) as { a: string; b: string };
    expect(resolved.a).toBe(resolved.b);
  });

  it('throws for an unknown placeholder', () => {
    expect(() => resolvePlaceholders('{{nope}}', ctx)).toThrow(/nope/);
  });

  it('leaves non-string values untouched', () => {
    expect(resolvePlaceholders({ n: 5, b: true, z: null }, ctx)).toEqual({ n: 5, b: true, z: null });
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/support/TestDataFactory.spec.ts`
Expected: FAIL, `Cannot find module './TestDataFactory'`.

- [ ] **Step 5: Implement `src/support/TestDataFactory.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { TestContext } from './TestContext';

export const NON_EXISTENT_ID = '6X4rfFVWjhSj9Vc9';
export const MALFORMED_ID = '!!!not-an-id!!!';

export function uniqueName(prefix: string): string {
  return `qa-auto-${prefix}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

const PLACEHOLDER = /^\{\{([a-zA-Z]+)(?::(\d+))?\}\}$/;

export function resolvePlaceholders<T>(value: T, ctx: TestContext, scope: Map<string, string> = new Map()): T {
  if (typeof value === 'string') {
    return resolveString(value, ctx, scope) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item, ctx, scope)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = resolvePlaceholders(item, ctx, scope);
    }
    return out as unknown as T;
  }

  return value;
}

function resolveString(value: string, ctx: TestContext, scope: Map<string, string>): string {
  const match = PLACEHOLDER.exec(value);

  if (!match) {
    return value;
  }

  const [, name, arg] = match;
  const cached = scope.get(value);

  if (cached !== undefined) {
    return cached;
  }

  const resolved = resolveName(name as string, arg, ctx);
  scope.set(value, resolved);
  return resolved;
}

function resolveName(name: string, arg: string | undefined, ctx: TestContext): string {
  switch (name) {
    case 'uuid':
      return randomUUID();
    case 'uniqueName':
      return uniqueName('case');
    case 'timestamp':
      return new Date().toISOString();
    case 'nonExistentId':
      return NON_EXISTENT_ID;
    case 'malformedId':
      return MALFORMED_ID;
    case 'longString':
      return 'x'.repeat(Number(arg ?? 100));
    default:
      return ctx.require(name);
  }
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/support/TestDataFactory.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Implement `src/support/globalSetup.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { labelsApi, projectsApi } from './apis';
import { loadEnv } from './env';
import { saveTestRun } from './testRun';

interface ProjectView {
  id: string;
  name: string;
}

interface PaginatedProjects {
  results: ProjectView[];
  next_cursor: string | null;
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export default async function globalSetup(): Promise<void> {
  const env = loadEnv();
  await removeStaleArtifacts(env.testProjectPrefix);

  const runId = randomUUID().slice(0, 8);
  const projectName = `${env.testProjectPrefix}-${new Date().toISOString()}-${runId}`;
  const created = await projectsApi.create<ProjectView>({ name: projectName });

  if (created.status !== 200 || !created.data?.id) {
    throw new Error(`Could not create the test project (HTTP ${created.status}): ${created.raw}`);
  }

  saveTestRun({ runId, projectId: created.data.id, projectName, startedAt: new Date().toISOString() });
  console.log(`\nTest project ${projectName} (${created.data.id}) created.`);
}

async function removeStaleArtifacts(prefix: string): Promise<void> {
  const projects = await projectsApi.list<PaginatedProjects>({ limit: 200 });

  for (const project of projects.data?.results ?? []) {
    if (!project.name.startsWith(`${prefix}-`)) {
      continue;
    }

    const stamp = Date.parse(project.name.slice(prefix.length + 1, prefix.length + 25));

    if (Number.isNaN(stamp) || Date.now() - stamp > STALE_AFTER_MS) {
      await projectsApi.delete(project.id);
      console.log(`Removed stale test project ${project.name}`);
    }
  }

  await removeQaLabels();
}

async function removeQaLabels(): Promise<void> {
  const labels = await labelsApi.list<{ results: { id: string; name: string }[] }>({ limit: 200 });

  for (const label of labels.data?.results ?? []) {
    if (label.name.startsWith('qa-auto-')) {
      await labelsApi.delete(label.id);
    }
  }
}
```

- [ ] **Step 8: Implement `src/support/globalTeardown.ts`**

```ts
import { labelsApi, projectsApi } from './apis';
import { loadTestRun } from './testRun';

export default async function globalTeardown(): Promise<void> {
  try {
    const run = loadTestRun();
    const deleted = await projectsApi.delete(run.projectId);
    console.log(`\nTest project ${run.projectName} deleted (HTTP ${deleted.status}).`);
  } catch (error: unknown) {
    console.warn(`Could not delete the test project: ${String(error)}`);
  }

  const labels = await labelsApi.list<{ results: { id: string; name: string }[] }>({ limit: 200 });

  for (const label of labels.data?.results ?? []) {
    if (label.name.startsWith('qa-auto-')) {
      await labelsApi.delete(label.id);
    }
  }
}
```

- [ ] **Step 9: Write the smoke test that proves isolation works**

`tests/smoke.test.ts`:

```ts
import { projectsApi, userApi } from '../src/support/apis';
import { TestContext } from '../src/support/TestContext';

describe('run isolation', () => {
  const ctx = new TestContext();

  it('authenticates against the live API', async () => {
    const res = await userApi.get();
    expect(res).toHaveStatus(200);
    expect(res.data).toMatchApiSchema('UserJSON');
  });

  it('created a dedicated project for this run', async () => {
    const res = await projectsApi.getById<{ id: string; name: string }>(ctx.projectId);
    expect(res).toHaveStatus(200);
    expect(res.data.name).toContain('QA-Automation-');
  });
});
```

- [ ] **Step 10: Run the smoke test against the live API**

Run: `npx jest --config jest.config.ts tests/smoke.test.ts`
Expected: PASS, 2 tests, with `Test project QA-Automation-... created.` in
the output and `... deleted (HTTP 200 or 204)` at the end. Confirm in the
Todoist web app that no `QA-Automation-` project is left behind.

- [ ] **Step 11: Commit**

```bash
git add src/support/testRun.ts src/support/TestContext.ts src/support/TestDataFactory.ts \
  src/support/TestDataFactory.spec.ts src/support/globalSetup.ts src/support/globalTeardown.ts tests/smoke.test.ts
git commit -m "feat: isolate each run in a dedicated project with automatic cleanup"
```

---

## Task 7: Test case loader

**Files:**
- Create: `src/support/loadTestCases.ts`
- Modify: `src/core/types.ts` (append the test-case types)
- Test: `src/support/loadTestCases.spec.ts`
- Create: `data/testcases/user/get.required.json` (fixture used by the loader test and by Task 10)

**Interfaces:**
- Consumes: nothing beyond `src/core/types.ts`
- Produces:
  - `interface ExpectedResult { status: number; schema?: string; bodyContains?: Record<string, unknown>; errorContains?: string; note?: string }`
  - `interface TestCase { id: string; title: string; description: string; priority: 'high' | 'medium' | 'low'; matrixKey?: string; preconditions?: string[]; pathParams?: Record<string, string>; query?: Record<string, unknown>; payload?: unknown; requestOptions?: RequestOptions; expected: ExpectedResult }`
  - `interface TestSuite { endpoint: string; resource: string; operation: string; kind: 'required' | 'optional' | 'negative'; cases: TestCase[] }`
  - `loadSuites(resource: string, operation: string): TestSuite[]`
  - `loadAllSuites(): TestSuite[]`

- [ ] **Step 1: Append the types to `src/core/types.ts`**

```ts
export type TestKind = 'required' | 'optional' | 'negative';

export interface ExpectedResult {
  status: number;
  schema?: string;
  bodyContains?: Record<string, unknown>;
  errorContains?: string;
  /** Czech note rendered into the generated documentation, e.g. a deviation from the spec */
  note?: string;
}

export interface TestCase {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  matrixKey?: string;
  preconditions?: string[];
  pathParams?: Record<string, string>;
  query?: Record<string, unknown>;
  payload?: unknown;
  requestOptions?: RequestOptions;
  expected: ExpectedResult;
}

export interface TestSuite {
  endpoint: string;
  resource: string;
  operation: string;
  kind: TestKind;
  cases: TestCase[];
}
```

- [ ] **Step 2: Create the first data file `data/testcases/user/get.required.json`**

```json
{
  "endpoint": "GET /api/v1/user",
  "resource": "user",
  "operation": "get",
  "kind": "required",
  "cases": [
    {
      "id": "TC-USER-GET-REQ-001",
      "title": "Načtení profilu přihlášeného uživatele",
      "description": "Ověřuje, že platný token vrátí profil uživatele odpovídající schématu UserJSON.",
      "priority": "high",
      "preconditions": ["Platný osobní API token"],
      "expected": { "status": 200, "schema": "UserJSON" }
    }
  ]
}
```

- [ ] **Step 3: Write the failing loader test**

`src/support/loadTestCases.spec.ts`:

```ts
import { loadAllSuites, loadSuites } from './loadTestCases';

describe('loadSuites', () => {
  it('loads the user suite', () => {
    const suites = loadSuites('user', 'get');
    expect(suites).toHaveLength(1);
    expect(suites[0]?.kind).toBe('required');
    expect(suites[0]?.cases[0]?.id).toBe('TC-USER-GET-REQ-001');
  });

  it('returns an empty array for an unknown resource', () => {
    expect(loadSuites('nope', 'get')).toEqual([]);
  });

  it('orders the kinds required, optional, negative', () => {
    const kinds = loadSuites('user', 'get').map((suite) => suite.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => order(a) - order(b)));
    function order(kind: string): number {
      return ['required', 'optional', 'negative'].indexOf(kind);
    }
  });

  it('rejects duplicate case IDs across the whole data set', () => {
    const ids = loadAllSuites().flatMap((suite) => suite.cases.map((testCase) => testCase.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects a case without an expected status', () => {
    for (const suite of loadAllSuites()) {
      for (const testCase of suite.cases) {
        expect(typeof testCase.expected.status).toBe('number');
      }
    }
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/support/loadTestCases.spec.ts`
Expected: FAIL, `Cannot find module './loadTestCases'`.

- [ ] **Step 5: Implement `src/support/loadTestCases.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestKind, TestSuite } from '../core/types';

const DATA_ROOT = resolve(__dirname, '..', '..', 'data', 'testcases');
const KIND_ORDER: TestKind[] = ['required', 'optional', 'negative'];

export function loadSuites(resource: string, operation: string): TestSuite[] {
  const dir = join(DATA_ROOT, resource);

  if (!existsSync(dir)) {
    return [];
  }

  return KIND_ORDER.map((kind) => join(dir, `${operation}.${kind}.json`))
    .filter((file) => existsSync(file))
    .map((file) => readSuite(file));
}

export function loadAllSuites(): TestSuite[] {
  if (!existsSync(DATA_ROOT)) {
    return [];
  }

  const suites: TestSuite[] = [];

  for (const resource of readdirSync(DATA_ROOT)) {
    for (const file of readdirSync(join(DATA_ROOT, resource))) {
      if (file.endsWith('.json')) {
        suites.push(readSuite(join(DATA_ROOT, resource, file)));
      }
    }
  }

  return suites;
}

function readSuite(file: string): TestSuite {
  const suite = JSON.parse(readFileSync(file, 'utf8')) as TestSuite;

  for (const testCase of suite.cases) {
    if (typeof testCase.expected?.status !== 'number') {
      throw new Error(`${file}: case ${testCase.id} has no numeric expected.status`);
    }
  }

  return suite;
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/support/loadTestCases.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/support/loadTestCases.ts src/support/loadTestCases.spec.ts data/testcases/user
git commit -m "feat: load data-driven test suites from JSON"
```

---

## Task 8: Negative behaviour probe

**Files:**
- Create: `scripts/probe-negatives.ts`
- Create: `docs/api-behaviour.md` (generated output, committed)

**Interfaces:**
- Consumes: `apis.ts` (Task 5), `env.ts` (Task 1)
- Produces: `docs/api-behaviour.md`, the reference every later task copies
  `expected.status` from

This task exists so that no later task guesses a status code.

- [ ] **Step 1: Implement `scripts/probe-negatives.ts`**

```ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { httpClient } from '../src/support/apis';
import type { ApiResponse, HttpMethod, RequestSpec } from '../src/core/types';

interface Probe {
  group: string;
  label: string;
  method: HttpMethod;
  path: string;
  spec: RequestSpec;
}

const BAD_TOKEN = '0000000000000000000000000000000000000000';
const NON_EXISTENT_ID = '6X4rfFVWjhSj9Vc9';
const MALFORMED_ID = '!!!not-an-id!!!';

async function main(): Promise<void> {
  const project = await httpClient.request<{ id: string }>('POST', '/api/v1/projects', {
    body: { name: `qa-auto-probe-${Date.now()}` },
  });
  const projectId = project.data.id;

  const probes: Probe[] = [
    { group: 'auth', label: 'no Authorization header', method: 'GET', path: '/api/v1/user', spec: { options: { token: null } } },
    { group: 'auth', label: 'invalid bearer token', method: 'GET', path: '/api/v1/user', spec: { options: { token: BAD_TOKEN } } },
    { group: 'auth', label: 'malformed auth scheme', method: 'GET', path: '/api/v1/user', spec: { options: { authHeader: 'NotBearer x' } } },
    { group: 'ids', label: 'GET task by non-existent id', method: 'GET', path: `/api/v1/tasks/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'ids', label: 'GET task by malformed id', method: 'GET', path: `/api/v1/tasks/${MALFORMED_ID}`, spec: {} },
    { group: 'ids', label: 'DELETE task by non-existent id', method: 'DELETE', path: `/api/v1/tasks/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'ids', label: 'GET project by non-existent id', method: 'GET', path: `/api/v1/projects/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'ids', label: 'GET section by non-existent id', method: 'GET', path: `/api/v1/sections/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'ids', label: 'GET comment by non-existent id', method: 'GET', path: `/api/v1/comments/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'ids', label: 'GET label by non-existent id', method: 'GET', path: `/api/v1/labels/${NON_EXISTENT_ID}`, spec: {} },
    { group: 'body', label: 'malformed JSON body', method: 'POST', path: '/api/v1/tasks', spec: { options: { rawBody: '{"content":' } } },
    { group: 'body', label: 'body is a bare string', method: 'POST', path: '/api/v1/tasks', spec: { options: { rawBody: '"just a string"' } } },
    { group: 'tasks', label: 'missing required content', method: 'POST', path: '/api/v1/tasks', spec: { body: { project_id: projectId } } },
    { group: 'tasks', label: 'empty content', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: '' } } },
    { group: 'tasks', label: 'content is a number', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 42 } } },
    { group: 'tasks', label: 'priority out of range', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', priority: 5 } } },
    { group: 'tasks', label: 'priority is a string', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', priority: 'high' } } },
    { group: 'tasks', label: 'labels is a string', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', labels: 'one' } } },
    { group: 'tasks', label: 'non-existent project_id', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', project_id: NON_EXISTENT_ID } } },
    { group: 'tasks', label: 'invalid due_date format', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', due_date: '31-12-2026' } } },
    { group: 'tasks', label: 'duration without duration_unit', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'p', duration: 30 } } },
    { group: 'tasks', label: 'content of 100000 characters', method: 'POST', path: '/api/v1/tasks', spec: { body: { content: 'x'.repeat(100000) } } },
    { group: 'projects', label: 'missing required name', method: 'POST', path: '/api/v1/projects', spec: { body: {} } },
    { group: 'projects', label: 'empty name', method: 'POST', path: '/api/v1/projects', spec: { body: { name: '' } } },
    { group: 'projects', label: 'invalid color', method: 'POST', path: '/api/v1/projects', spec: { body: { name: 'qa-auto-probe', color: 'not_a_color' } } },
    { group: 'projects', label: 'invalid view_style', method: 'POST', path: '/api/v1/projects', spec: { body: { name: 'qa-auto-probe', view_style: 'grid' } } },
    { group: 'sections', label: 'missing project_id', method: 'POST', path: '/api/v1/sections', spec: { body: { name: 'qa-auto-probe' } } },
    { group: 'sections', label: 'missing name', method: 'POST', path: '/api/v1/sections', spec: { body: { project_id: projectId } } },
    { group: 'sections', label: 'non-existent project_id', method: 'POST', path: '/api/v1/sections', spec: { body: { name: 'qa-auto-probe', project_id: NON_EXISTENT_ID } } },
    { group: 'comments', label: 'missing content', method: 'POST', path: '/api/v1/comments', spec: { body: { project_id: projectId } } },
    { group: 'comments', label: 'neither task_id nor project_id', method: 'POST', path: '/api/v1/comments', spec: { body: { content: 'qa-auto-probe' } } },
    { group: 'comments', label: 'both task_id and project_id', method: 'POST', path: '/api/v1/comments', spec: { body: { content: 'qa-auto-probe', project_id: projectId, task_id: NON_EXISTENT_ID } } },
    { group: 'comments', label: 'content over 15000 characters', method: 'POST', path: '/api/v1/comments', spec: { body: { content: 'x'.repeat(15001), project_id: projectId } } },
    { group: 'labels', label: 'missing name', method: 'POST', path: '/api/v1/labels', spec: { body: {} } },
    { group: 'labels', label: 'empty name', method: 'POST', path: '/api/v1/labels', spec: { body: { name: '' } } },
    { group: 'labels', label: 'name over 128 characters', method: 'POST', path: '/api/v1/labels', spec: { body: { name: 'x'.repeat(129) } } },
    { group: 'labels', label: 'invalid color', method: 'POST', path: '/api/v1/labels', spec: { body: { name: 'qa-auto-probe-color', color: 'not_a_color' } } },
    { group: 'paging', label: 'limit=0', method: 'GET', path: '/api/v1/tasks', spec: { query: { limit: 0 } } },
    { group: 'paging', label: 'limit=201', method: 'GET', path: '/api/v1/tasks', spec: { query: { limit: 201 } } },
    { group: 'paging', label: 'limit=-1', method: 'GET', path: '/api/v1/tasks', spec: { query: { limit: -1 } } },
    { group: 'paging', label: 'limit=abc', method: 'GET', path: '/api/v1/tasks', spec: { query: { limit: 'abc' } } },
    { group: 'paging', label: 'invalid cursor', method: 'GET', path: '/api/v1/tasks', spec: { query: { cursor: 'not-a-real-cursor' } } },
  ];

  const rows: string[] = [];

  for (const probe of probes) {
    const res: ApiResponse = await httpClient.request(probe.method, probe.path, probe.spec);
    rows.push(`| ${probe.group} | ${probe.label} | \`${probe.method} ${probe.path}\` | **${res.status}** | ${excerpt(res)} |`);
    console.log(`${res.status}  ${probe.group}: ${probe.label}`);
  }

  await httpClient.request('DELETE', `/api/v1/projects/${projectId}`);

  const doc = [
    '# Skutečné chování Todoist API u negativních scénářů',
    '',
    `Vygenerováno: ${new Date().toISOString()} skriptem \`scripts/probe-negatives.ts\`.`,
    '',
    'Tabulka je zdrojem pravdy pro pole `expected.status` v `data/testcases/**`.',
    'Nikdy neodhadujte status kód, vždy jej vezměte odsud a při změně chování API skript spusťte znovu.',
    '',
    '| Skupina | Scénář | Požadavek | Status | Výřez odpovědi |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  writeFileSync(resolve(__dirname, '..', 'docs', 'api-behaviour.md'), doc, 'utf8');
  console.log('\nWrote docs/api-behaviour.md');
}

function excerpt(res: ApiResponse): string {
  return res.raw.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 120) || '(prázdné tělo)';
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run the probe**

Run: `npm run probe`
Expected: one line per probe on stdout and `docs/api-behaviour.md` written
with 42 rows. Every row must show a real status code, not a blank.

- [ ] **Step 3: Confirm the probe cleaned up after itself**

Run: `node -e "fetch('https://api.todoist.com/api/v1/projects?limit=200',{headers:{Authorization:'Bearer '+process.env.TODOIST_API_TOKEN}}).then(r=>r.json()).then(d=>console.log(d.results.filter(p=>p.name.startsWith('qa-auto-probe')).length))"`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/probe-negatives.ts docs/api-behaviour.md
git commit -m "test: record real Todoist API behaviour for negative scenarios"
```

---

## Task 9: Test case documentation generator

**Files:**
- Create: `scripts/generate-test-docs.ts`
- Create: `docs/test-cases/**` (generated)
- Test: `src/support/loadTestCases.spec.ts` already guards ID uniqueness; this task adds a CLI `--check` mode used by CI

**Interfaces:**
- Consumes: `loadAllSuites()` (Task 7)
- Produces: `docs/test-cases/<resource>/<TC-ID>.md`, `docs/test-cases/README.md`,
  and a non-zero exit code from `npm run docs:check` when the tree is stale

- [ ] **Step 1: Implement `scripts/generate-test-docs.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadAllSuites } from '../src/support/loadTestCases';
import type { TestCase, TestSuite } from '../src/core/types';

const DOCS_ROOT = resolve(__dirname, '..', 'docs', 'test-cases');
const KIND_LABEL: Record<string, string> = {
  required: 'povinná pole',
  optional: 'nepovinná pole',
  negative: 'negativní scénář',
};

function renderCase(suite: TestSuite, testCase: TestCase): string {
  const lines = [
    `# ${testCase.id}`,
    '',
    `**Název:** ${testCase.title}`,
    '',
    `**Endpoint:** \`${suite.endpoint}\``,
    '',
    `**Resource:** ${suite.resource}`,
    '',
    `**Typ sady:** ${KIND_LABEL[suite.kind] ?? suite.kind}`,
    '',
    `**Priorita:** ${testCase.priority}`,
    '',
    '## Popis',
    '',
    testCase.description,
    '',
    '## Předpoklady',
    '',
    ...(testCase.preconditions?.length
      ? testCase.preconditions.map((item) => `- ${item}`)
      : ['- Platný API token v proměnné `TODOIST_API_TOKEN`']),
    '',
    '## Vstupní data',
    '',
  ];

  if (testCase.pathParams) {
    lines.push('Parametry cesty:', '', '```json', JSON.stringify(testCase.pathParams, null, 2), '```', '');
  }
  if (testCase.query) {
    lines.push('Parametry dotazu:', '', '```json', JSON.stringify(testCase.query, null, 2), '```', '');
  }
  if (testCase.payload !== undefined) {
    lines.push('Tělo požadavku:', '', '```json', JSON.stringify(testCase.payload, null, 2), '```', '');
  }
  if (testCase.requestOptions) {
    lines.push('Úprava požadavku:', '', '```json', JSON.stringify(testCase.requestOptions, null, 2), '```', '');
  }
  if (!testCase.pathParams && !testCase.query && testCase.payload === undefined && !testCase.requestOptions) {
    lines.push('Bez vstupních dat, volá se pouze endpoint.', '');
  }

  lines.push(
    '## Kroky',
    '',
    '1. Vytvoř izolovaný testovací projekt (zajišťuje `globalSetup`).',
    '2. Připrav fixture entity uvedené v předpokladech.',
    `3. Odešli požadavek \`${suite.endpoint}\` s výše uvedenými daty.`,
    '4. Ověř návratový kód, schéma odpovědi a obsah těla.',
    '',
    '## Očekávaný výsledek',
    '',
    `- HTTP status: **${testCase.expected.status}**`,
  );

  if (testCase.expected.schema) {
    lines.push(`- Tělo odpovídá OpenAPI schématu \`${testCase.expected.schema}\``);
  }
  if (testCase.expected.bodyContains) {
    lines.push('- Tělo obsahuje:', '', '```json', JSON.stringify(testCase.expected.bodyContains, null, 2), '```');
  }
  if (testCase.expected.errorContains) {
    lines.push(`- Chybová odpověď obsahuje text \`${testCase.expected.errorContains}\``);
  }
  if (testCase.matrixKey) {
    lines.push('', `**Skupina negativní matice:** \`${testCase.matrixKey}\``);
  }
  if (testCase.expected.note) {
    lines.push('', '## Poznámka', '', testCase.expected.note);
  }

  lines.push(
    '',
    '## Automatizace',
    '',
    `- Testovací soubor: [tests/${suite.resource}/${suite.operation}.test.ts](../../../tests/${suite.resource}/${suite.operation}.test.ts)`,
    `- Datový soubor: [data/testcases/${suite.resource}/${suite.operation}.${suite.kind}.json](../../../data/testcases/${suite.resource}/${suite.operation}.${suite.kind}.json)`,
    '',
  );

  return lines.join('\n');
}

function renderIndex(suites: TestSuite[]): string {
  const total = suites.reduce((sum, suite) => sum + suite.cases.length, 0);
  const byKind = (kind: string): number =>
    suites.filter((suite) => suite.kind === kind).reduce((sum, suite) => sum + suite.cases.length, 0);

  const lines = [
    '# Katalog testovacích případů',
    '',
    'Tento adresář je generovaný. Needitujte jej ručně, upravte `data/testcases/**`',
    'a spusťte `npm run docs:generate`.',
    '',
    `Celkem test case: **${total}** (povinná pole ${byKind('required')}, nepovinná pole ${byKind('optional')}, negativní ${byKind('negative')}).`,
    '',
  ];

  const resources = [...new Set(suites.map((suite) => suite.resource))].sort();

  for (const resource of resources) {
    lines.push(`## ${resource}`, '', '| ID | Typ | Endpoint | Název |', '|---|---|---|---|');

    for (const suite of suites.filter((item) => item.resource === resource)) {
      for (const testCase of suite.cases) {
        lines.push(
          `| [${testCase.id}](${resource}/${testCase.id}.md) | ${KIND_LABEL[suite.kind]} | \`${suite.endpoint}\` | ${testCase.title} |`,
        );
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function build(): Map<string, string> {
  const suites = loadAllSuites().sort((a, b) =>
    `${a.resource}${a.operation}${a.kind}`.localeCompare(`${b.resource}${b.operation}${b.kind}`),
  );
  const files = new Map<string, string>();

  for (const suite of suites) {
    for (const testCase of suite.cases) {
      files.set(join(suite.resource, `${testCase.id}.md`), renderCase(suite, testCase));
    }
  }

  files.set('README.md', renderIndex(suites));
  return files;
}

function main(): void {
  const files = build();
  const check = process.argv.includes('--check');

  if (check) {
    const stale: string[] = [];

    for (const [relative, content] of files) {
      const path = join(DOCS_ROOT, relative);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
        stale.push(relative);
      }
    }

    if (stale.length > 0) {
      console.error(`Documentation is out of date for ${stale.length} file(s):`);
      stale.slice(0, 20).forEach((file) => console.error(`  - ${file}`));
      console.error('Run: npm run docs:generate');
      process.exit(1);
    }

    console.log(`Documentation is up to date (${files.size} files).`);
    return;
  }

  rmSync(DOCS_ROOT, { recursive: true, force: true });

  for (const [relative, content] of files) {
    const path = join(DOCS_ROOT, relative);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }

  console.log(`Generated ${files.size} documentation files in docs/test-cases.`);
}

main();
```

- [ ] **Step 2: Generate the docs for the single user case that exists so far**

Run: `npm run docs:generate`
Expected: `Generated 2 documentation files in docs/test-cases.` and
`docs/test-cases/user/TC-USER-GET-REQ-001.md` exists in Czech.

- [ ] **Step 3: Verify the check mode detects drift**

Run: `npm run docs:check`
Expected: `Documentation is up to date (2 files).`, exit code 0.

Then run `printf 'x' >> docs/test-cases/README.md && npm run docs:check`
Expected: exit code 1 with `README.md` listed. Restore with
`npm run docs:generate`.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-test-docs.ts docs/test-cases
git commit -m "docs: generate one markdown file per test case from the JSON data"
```

---

## Task 10: Suite runner helper and the user test suite

**Files:**
- Create: `src/support/runSuite.ts`
- Create: `data/testcases/user/get.negative.json`
- Create: `tests/user/get.test.ts`
- Test: `src/support/runSuite.spec.ts`

**Interfaces:**
- Consumes: `resolvePlaceholders` (Task 6), `TestCase`/`TestSuite` (Task 7), matchers (Task 4)
- Produces:
  - `interface ResolvedCase { payload: unknown; query: Record<string, unknown>; pathParams: Record<string, string>; options: RequestOptions | undefined; expected: ExpectedResult }`
  - `resolveCase(testCase: TestCase, ctx: TestContext): ResolvedCase`
  - `assertCase(response: ApiResponse, resolved: ResolvedCase): void`

Every later resource task uses exactly these two functions. Do not
re-implement assertions in individual test files.

- [ ] **Step 1: Write the failing test**

`src/support/runSuite.spec.ts`:

```ts
import './matchers';
import { TestContext } from './TestContext';
import { assertCase, resolveCase } from './runSuite';
import type { ApiResponse, TestCase } from '../core/types';

const ctx = new TestContext({
  runId: 'r1',
  projectId: 'P1',
  projectName: 'QA-Automation-r1',
  startedAt: '2026-08-28T05:00:00.000Z',
});

function testCase(overrides: Partial<TestCase>): TestCase {
  return {
    id: 'TC-X-001',
    title: 'x',
    description: 'x',
    priority: 'medium',
    expected: { status: 200 },
    ...overrides,
  };
}

function response(status: number, data: unknown, raw = JSON.stringify(data)): ApiResponse {
  return { status, statusText: '', headers: {}, data, raw, durationMs: 1 };
}

describe('runSuite', () => {
  it('resolves placeholders in payload, query and path params', () => {
    const resolved = resolveCase(
      testCase({ payload: { project_id: '{{projectId}}' }, query: { project_id: '{{projectId}}' }, pathParams: { id: '{{projectId}}' } }),
      ctx,
    );

    expect(resolved.payload).toEqual({ project_id: 'P1' });
    expect(resolved.query).toEqual({ project_id: 'P1' });
    expect(resolved.pathParams).toEqual({ id: 'P1' });
  });

  it('resolves placeholders inside expected.bodyContains consistently with the payload', () => {
    const resolved = resolveCase(
      testCase({ payload: { content: '{{uniqueName}}' }, expected: { status: 200, bodyContains: { content: '{{uniqueName}}' } } }),
      ctx,
    );

    expect((resolved.expected.bodyContains as { content: string }).content).toBe(
      (resolved.payload as { content: string }).content,
    );
  });

  it('asserts status, schema and body', () => {
    const resolved = resolveCase(
      testCase({ expected: { status: 200, schema: 'LabelRestView', bodyContains: { name: 'qa' } } }),
      ctx,
    );

    expect(() =>
      assertCase(response(200, { id: '1', name: 'qa', color: 'charcoal', order: 1, is_favorite: false }), resolved),
    ).not.toThrow();
  });

  it('fails when the status differs', () => {
    const resolved = resolveCase(testCase({ expected: { status: 200 } }), ctx);
    expect(() => assertCase(response(400, null, 'Bad Request'), resolved)).toThrow(/400/);
  });

  it('checks errorContains against the raw body', () => {
    const resolved = resolveCase(testCase({ expected: { status: 400, errorContains: 'content' } }), ctx);
    expect(() => assertCase(response(400, null, 'content is required'), resolved)).not.toThrow();
    expect(() => assertCase(response(400, null, 'something else'), resolved)).toThrow(/content/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest --config jest.unit.config.ts src/support/runSuite.spec.ts`
Expected: FAIL, `Cannot find module './runSuite'`.

- [ ] **Step 3: Implement `src/support/runSuite.ts`**

```ts
import type { ApiResponse, ExpectedResult, RequestOptions, TestCase } from '../core/types';
import type { TestContext } from './TestContext';
import { resolvePlaceholders } from './TestDataFactory';

export interface ResolvedCase {
  payload: unknown;
  query: Record<string, unknown>;
  pathParams: Record<string, string>;
  options: RequestOptions | undefined;
  expected: ExpectedResult;
}

export function resolveCase(testCase: TestCase, ctx: TestContext): ResolvedCase {
  const scope = new Map<string, string>();

  return {
    payload: testCase.payload === undefined ? undefined : resolvePlaceholders(testCase.payload, ctx, scope),
    query: resolvePlaceholders(testCase.query ?? {}, ctx, scope),
    pathParams: resolvePlaceholders(testCase.pathParams ?? {}, ctx, scope),
    options: testCase.requestOptions,
    expected: resolvePlaceholders(testCase.expected, ctx, scope),
  };
}

export function assertCase(response: ApiResponse, resolved: ResolvedCase): void {
  expect(response).toHaveStatus(resolved.expected.status);

  if (resolved.expected.schema) {
    expect(response.data).toMatchApiSchema(resolved.expected.schema);
  }

  if (resolved.expected.bodyContains) {
    expect(response.data).toMatchObject(resolved.expected.bodyContains);
  }

  if (resolved.expected.errorContains) {
    expect(response.raw).toContain(resolved.expected.errorContains);
  }
}
```

The shared `scope` map is what makes `{{uniqueName}}` resolve to the same
value in the payload and in `expected.bodyContains`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest --config jest.unit.config.ts src/support/runSuite.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `data/testcases/user/get.negative.json`**

Three cases, each with `expected.status` copied from the `auth` group of
`docs/api-behaviour.md`:

```json
{
  "endpoint": "GET /api/v1/user",
  "resource": "user",
  "operation": "get",
  "kind": "negative",
  "cases": [
    {
      "id": "TC-USER-GET-NEG-001",
      "title": "Volání bez hlavičky Authorization",
      "description": "Ověřuje, že neautentizovaný požadavek je odmítnut.",
      "priority": "high",
      "matrixKey": "AUTH_MISSING",
      "requestOptions": { "token": null },
      "expected": { "status": 401 }
    },
    {
      "id": "TC-USER-GET-NEG-002",
      "title": "Volání s neplatným tokenem",
      "description": "Ověřuje, že token neexistujícího uživatele je odmítnut.",
      "priority": "high",
      "matrixKey": "AUTH_INVALID",
      "requestOptions": { "token": "0000000000000000000000000000000000000000" },
      "expected": { "status": 401 }
    },
    {
      "id": "TC-USER-GET-NEG-003",
      "title": "Volání s chybným autentizačním schématem",
      "description": "Ověřuje, že jiné schéma než Bearer je odmítnuto.",
      "priority": "medium",
      "matrixKey": "AUTH_MALFORMED",
      "requestOptions": { "authHeader": "NotBearer 0000000000000000000000000000000000000000" },
      "expected": { "status": 401 }
    }
  ]
}
```

Before saving, open `docs/api-behaviour.md` and replace each `401` above
with the status actually recorded for that scenario. If any recorded status
differs from `401`, add an `expected.note` in Czech explaining the
deviation.

- [ ] **Step 6: Write `tests/user/get.test.ts`**

```ts
import { userApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';

const ctx = new TestContext();

describe('GET /api/v1/user', () => {
  describe.each(loadSuites('user', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await userApi.get(resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Run the user suite against the live API**

Run: `npx jest --config jest.config.ts tests/user`
Expected: PASS, 4 tests (1 required, 3 negative).

- [ ] **Step 8: Regenerate the documentation and commit**

```bash
npm run docs:generate
git add src/support/runSuite.ts src/support/runSuite.spec.ts data/testcases/user tests/user docs/test-cases
git commit -m "test: cover GET /api/v1/user with required and negative cases"
```

---

## Task 11: Projects test suite

**Files:**
- Create: `data/testcases/projects/create.{required,optional,negative}.json`
- Create: `data/testcases/projects/list.{required,optional,negative}.json`
- Create: `data/testcases/projects/get.{required,negative}.json`
- Create: `data/testcases/projects/update.{required,optional,negative}.json`
- Create: `data/testcases/projects/delete.{required,negative}.json`
- Create: `tests/projects/create.test.ts`, `list.test.ts`, `get.test.ts`, `update.test.ts`, `delete.test.ts`

**Interfaces:**
- Consumes: `projectsApi` (Task 5), `resolveCase`/`assertCase` (Task 10)
- Produces: fixture key `createdProjectId` registered in `beforeAll` of the
  get/update/delete test files

Field reference from the spec, `POST /api/v1/projects`: required `name`;
optional `description`, `parent_id`, `color` (`APIColorID`, default
`charcoal`), `is_favorite` (default `false`), `view_style`
(`list` | `board` | `calendar`), `workspace_id`.
`POST /api/v1/projects/{project_id}` has no required fields and additionally
accepts `child_order`, `is_collapsed`, `folder_id`.
`GET /api/v1/projects` accepts `folder_id`, `workspace_id`, `cursor`,
`limit` (max 200, default 50).

`APIColorID` string enum: `berry_red`, `red`, `orange`, `yellow`,
`olive_green`, `lime_green`, `green`, `mint_green`, `teal`, `sky_blue`,
`light_blue`, `blue`, `grape`, `violet`, `lavender`, `magenta`, `salmon`,
`charcoal`, `grey`, `taupe`. The same enum also accepts integers 30 to 49.

- [ ] **Step 1: Write `create.required.json`**

Cases:

| ID | Title (Czech) | Payload | Expected |
|---|---|---|---|
| TC-PROJECTS-CREATE-REQ-001 | Vytvoření projektu pouze s povinným polem name | `{"name":"{{uniqueName}}"}` | 200, `AnyProjectSyncViewResponse`, body contains the name |
| TC-PROJECTS-CREATE-REQ-002 | Server doplní výchozí barvu charcoal | `{"name":"{{uniqueName}}"}` | 200, body contains `{"color":"charcoal"}` |
| TC-PROJECTS-CREATE-REQ-003 | Server doplní is_favorite na false | `{"name":"{{uniqueName}}"}` | 200, body contains `{"is_favorite":false}` |

Full JSON for the first case, the rest follow the same shape:

```json
{
  "endpoint": "POST /api/v1/projects",
  "resource": "projects",
  "operation": "create",
  "kind": "required",
  "cases": [
    {
      "id": "TC-PROJECTS-CREATE-REQ-001",
      "title": "Vytvoření projektu pouze s povinným polem name",
      "description": "Ověřuje, že projekt lze vytvořit minimálním validním payloadem obsahujícím pouze název.",
      "priority": "high",
      "preconditions": ["Platný API token"],
      "payload": { "name": "{{uniqueName}}" },
      "expected": {
        "status": 200,
        "schema": "AnyProjectSyncViewResponse",
        "bodyContains": { "name": "{{uniqueName}}" }
      }
    }
  ]
}
```

- [ ] **Step 2: Write `create.optional.json`**

One case per optional field plus one combining them all. Every case sends
`name` as well, because it is required.

| ID | Optional field exercised |
|---|---|
| TC-PROJECTS-CREATE-OPT-001 | `description` |
| TC-PROJECTS-CREATE-OPT-002 | `color` as a string (`blue`) |
| TC-PROJECTS-CREATE-OPT-003 | `color` as an integer (`38`) |
| TC-PROJECTS-CREATE-OPT-004 | `is_favorite: true` |
| TC-PROJECTS-CREATE-OPT-005 | `view_style: "list"` |
| TC-PROJECTS-CREATE-OPT-006 | `view_style: "board"` |
| TC-PROJECTS-CREATE-OPT-007 | `view_style: "calendar"` |
| TC-PROJECTS-CREATE-OPT-008 | `parent_id` set to `{{projectId}}` |
| TC-PROJECTS-CREATE-OPT-009 | all optional fields at once |

- [ ] **Step 3: Write `create.negative.json`**

| ID | Matrix key / field case |
|---|---|
| TC-PROJECTS-CREATE-NEG-001 | missing `name` |
| TC-PROJECTS-CREATE-NEG-002 | empty `name` |
| TC-PROJECTS-CREATE-NEG-003 | `name` is a number |
| TC-PROJECTS-CREATE-NEG-004 | `color: "not_a_color"` |
| TC-PROJECTS-CREATE-NEG-005 | `view_style: "grid"` |
| TC-PROJECTS-CREATE-NEG-006 | `parent_id: "{{nonExistentId}}"` |
| TC-PROJECTS-CREATE-NEG-007 | `parent_id: "{{malformedId}}"` |
| TC-PROJECTS-CREATE-NEG-008 | `is_favorite: "yes"` |
| TC-PROJECTS-CREATE-NEG-009 | `AUTH_MISSING` |
| TC-PROJECTS-CREATE-NEG-010 | `AUTH_INVALID` |
| TC-PROJECTS-CREATE-NEG-011 | `AUTH_MALFORMED` |
| TC-PROJECTS-CREATE-NEG-012 | `BODY_MALFORMED` |
| TC-PROJECTS-CREATE-NEG-013 | `BODY_NOT_OBJECT` |

Take every `expected.status` from the `projects`, `auth` and `body` groups
of `docs/api-behaviour.md`. Where a scenario is not in the probe output,
add it to `scripts/probe-negatives.ts`, rerun `npm run probe`, and commit
the refreshed `docs/api-behaviour.md` together with the data file.

- [ ] **Step 4: Write the list, get, update and delete data files**

`list.required.json`: default listing returns 200 and
`PaginatedList_AnyProjectSyncViewResponse_`; the run project is present in
the results.
`list.optional.json`: `limit: 1`, `limit: 200`, `cursor` taken from a first
page (resolved at runtime by the test, see Step 6).
`list.negative.json`: `PAGE_LIMIT_ZERO`, `PAGE_LIMIT_OVER_MAX`,
`PAGE_LIMIT_NEGATIVE`, `PAGE_LIMIT_TYPE`, `PAGE_CURSOR_INVALID`,
`AUTH_MISSING`, `AUTH_INVALID`, `AUTH_MALFORMED`.

`get.required.json`: read back `{{createdProjectId}}`, 200 plus schema.
`get.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, `AUTH_MISSING`,
`AUTH_INVALID`, `AUTH_MALFORMED`.

`update.required.json`: rename `{{createdProjectId}}` and verify the new
name comes back.
`update.optional.json`: one case each for `description`, `color`,
`is_favorite`, `view_style`, `child_order`, `is_collapsed`.
`update.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, invalid `color`,
invalid `view_style`, empty object body, `BODY_MALFORMED`, `AUTH_MISSING`,
`AUTH_INVALID`, `AUTH_MALFORMED`.

`delete.required.json`: delete a throwaway project created in `beforeEach`.
`delete.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, deleting the same
project twice, `AUTH_MISSING`, `AUTH_INVALID`, `AUTH_MALFORMED`.

- [ ] **Step 5: Write `tests/projects/create.test.ts`**

```ts
import { projectsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';

const ctx = new TestContext();
const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await projectsApi.delete(id);
  }
});

describe('POST /api/v1/projects', () => {
  describe.each(loadSuites('projects', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await projectsApi.create<{ id?: string }>(resolved.payload, resolved.options);

      if (response.status === 200 && response.data?.id) {
        createdIds.push(response.data.id);
      }

      assertCase(response, resolved);
    });
  });
});
```

Projects created here are siblings of the run project, not children, so
they must be deleted explicitly. That is what `createdIds` is for.

- [ ] **Step 6: Write `tests/projects/list.test.ts`**

```ts
import { projectsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';

const ctx = new TestContext();

beforeAll(async () => {
  const firstPage = await projectsApi.list<{ next_cursor: string | null }>({ limit: 1 });
  ctx.set('validCursor', firstPage.data?.next_cursor ?? '');
});

describe('GET /api/v1/projects', () => {
  describe.each(loadSuites('projects', 'list'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await projectsApi.list(resolved.query, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Write `tests/projects/get.test.ts`**

```ts
import { projectsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let projectId = '';

beforeAll(async () => {
  const created = await projectsApi.create<{ id: string }>({ name: uniqueName('project-get') });
  projectId = created.data.id;
  ctx.set('createdProjectId', projectId);
});

afterAll(async () => {
  await projectsApi.delete(projectId);
});

describe('GET /api/v1/projects/{project_id}', () => {
  describe.each(loadSuites('projects', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? projectId;
      const response = await projectsApi.getById(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 8: Write `tests/projects/update.test.ts`**

```ts
import { projectsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let projectId = '';

beforeEach(async () => {
  const created = await projectsApi.create<{ id: string }>({ name: uniqueName('project-update') });
  projectId = created.data.id;
  ctx.set('createdProjectId', projectId);
});

afterEach(async () => {
  await projectsApi.delete(projectId);
});

describe('POST /api/v1/projects/{project_id}', () => {
  describe.each(loadSuites('projects', 'update'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? projectId;
      const response = await projectsApi.update(id, resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 9: Write `tests/projects/delete.test.ts`**

```ts
import { projectsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let projectId = '';

beforeEach(async () => {
  const created = await projectsApi.create<{ id: string }>({ name: uniqueName('project-delete') });
  projectId = created.data.id;
  ctx.set('createdProjectId', projectId);
});

afterEach(async () => {
  await projectsApi.delete(projectId);
});

describe('DELETE /api/v1/projects/{project_id}', () => {
  describe.each(loadSuites('projects', 'delete'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? projectId;
      const response = await projectsApi.delete(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

The `afterEach` delete of an already deleted project is harmless; the
client does not throw on 404.

- [ ] **Step 10: Run the projects suite**

Run: `npx jest --config jest.config.ts tests/projects`
Expected: PASS. Any failure is a real finding: either the data file has the
wrong expected status, in which case check it against
`docs/api-behaviour.md`, or the API behaviour changed, in which case rerun
`npm run probe` and record the new value with an `expected.note`.

- [ ] **Step 11: Regenerate docs and commit**

```bash
npm run docs:generate
git add data/testcases/projects tests/projects docs/test-cases docs/api-behaviour.md
git commit -m "test: cover the projects endpoints with required, optional and negative cases"
```

---

## Task 12: Sections test suite

**Files:**
- Create: `data/testcases/sections/create.{required,optional,negative}.json`
- Create: `data/testcases/sections/list.{required,optional,negative}.json`
- Create: `data/testcases/sections/get.{required,negative}.json`
- Create: `data/testcases/sections/update.{required,optional,negative}.json`
- Create: `data/testcases/sections/delete.{required,negative}.json`
- Create: `tests/sections/create.test.ts`, `list.test.ts`, `get.test.ts`, `update.test.ts`, `delete.test.ts`

**Interfaces:**
- Consumes: `sectionsApi` (Task 5), `resolveCase`/`assertCase` (Task 10)
- Produces: fixture key `createdSectionId`

Field reference: `POST /api/v1/sections` requires `name` **and**
`project_id`; optional `order`, `description`.
`POST /api/v1/sections/{section_id}` has no required fields and accepts
`name`, `section_order`, `is_collapsed`, `description`.
`GET /api/v1/sections` accepts `project_id`, `cursor`, `limit`, `public_key`.
Response schemas: `SectionSyncView` and `PaginatedList_SectionSyncView_`.

- [ ] **Step 1: Write `create.required.json`**

| ID | Title | Payload |
|---|---|---|
| TC-SECTIONS-CREATE-REQ-001 | Vytvoření sekce s povinnými poli name a project_id | `{"name":"{{uniqueName}}","project_id":"{{projectId}}"}` |
| TC-SECTIONS-CREATE-REQ-002 | Sekce se založí uvnitř zadaného projektu | same payload, `bodyContains` `{"project_id":"{{projectId}}"}` |

- [ ] **Step 2: Write `create.optional.json`**

| ID | Optional field |
|---|---|
| TC-SECTIONS-CREATE-OPT-001 | `description` |
| TC-SECTIONS-CREATE-OPT-002 | `order: 1` |
| TC-SECTIONS-CREATE-OPT-003 | both optional fields at once |

- [ ] **Step 3: Write `create.negative.json`**

| ID | Case |
|---|---|
| TC-SECTIONS-CREATE-NEG-001 | missing `name` |
| TC-SECTIONS-CREATE-NEG-002 | missing `project_id` |
| TC-SECTIONS-CREATE-NEG-003 | empty `name` |
| TC-SECTIONS-CREATE-NEG-004 | `name` is a number |
| TC-SECTIONS-CREATE-NEG-005 | `project_id: "{{nonExistentId}}"` |
| TC-SECTIONS-CREATE-NEG-006 | `project_id: "{{malformedId}}"` |
| TC-SECTIONS-CREATE-NEG-007 | `order` is a string |
| TC-SECTIONS-CREATE-NEG-008 | `AUTH_MISSING` |
| TC-SECTIONS-CREATE-NEG-009 | `AUTH_INVALID` |
| TC-SECTIONS-CREATE-NEG-010 | `AUTH_MALFORMED` |
| TC-SECTIONS-CREATE-NEG-011 | `BODY_MALFORMED` |
| TC-SECTIONS-CREATE-NEG-012 | `BODY_NOT_OBJECT` |

- [ ] **Step 4: Write the list, get, update and delete data files**

`list.required.json`: listing filtered by `project_id: "{{projectId}}"`
returns 200 and `PaginatedList_SectionSyncView_`.
`list.optional.json`: `limit: 1`, `limit: 200`, listing without
`project_id`.
`list.negative.json`: the five `PAGE_*` rows, `project_id` non-existent,
`project_id` malformed, and the three `AUTH_*` rows.

`get.required.json`: read back `{{createdSectionId}}`.
`get.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, three `AUTH_*`.

`update.required.json`: rename `{{createdSectionId}}`.
`update.optional.json`: `description`, `section_order`, `is_collapsed`.
`update.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, `name` empty,
`section_order` as a string, `BODY_MALFORMED`, three `AUTH_*`.

`delete.required.json`: delete the section created in `beforeEach`.
`delete.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, double delete,
three `AUTH_*`.

Statuses come from `docs/api-behaviour.md`; extend
`scripts/probe-negatives.ts` and rerun `npm run probe` for any scenario not
already recorded.

- [ ] **Step 5: Write `tests/sections/create.test.ts`**

```ts
import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';

const ctx = new TestContext();

describe('POST /api/v1/sections', () => {
  describe.each(loadSuites('sections', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await sectionsApi.create(resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

No explicit cleanup is needed: every section is created inside the run
project, which `globalTeardown` deletes.

- [ ] **Step 6: Write `tests/sections/list.test.ts`**

```ts
import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();

beforeAll(async () => {
  await sectionsApi.create({ name: uniqueName('section-list'), project_id: ctx.projectId });
});

describe('GET /api/v1/sections', () => {
  describe.each(loadSuites('sections', 'list'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await sectionsApi.list(resolved.query, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Write `tests/sections/get.test.ts`, `update.test.ts` and `delete.test.ts`**

`get.test.ts`:

```ts
import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let sectionId = '';

beforeAll(async () => {
  const created = await sectionsApi.create<{ id: string }>({ name: uniqueName('section-get'), project_id: ctx.projectId });
  sectionId = created.data.id;
  ctx.set('createdSectionId', sectionId);
});

describe('GET /api/v1/sections/{section_id}', () => {
  describe.each(loadSuites('sections', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? sectionId;
      const response = await sectionsApi.getById(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`update.test.ts` is the same file with `beforeEach` instead of `beforeAll`
and `sectionsApi.update(id, resolved.payload, resolved.options)` as the
call:

```ts
import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let sectionId = '';

beforeEach(async () => {
  const created = await sectionsApi.create<{ id: string }>({ name: uniqueName('section-update'), project_id: ctx.projectId });
  sectionId = created.data.id;
  ctx.set('createdSectionId', sectionId);
});

describe('POST /api/v1/sections/{section_id}', () => {
  describe.each(loadSuites('sections', 'update'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? sectionId;
      const response = await sectionsApi.update(id, resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`delete.test.ts`:

```ts
import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let sectionId = '';

beforeEach(async () => {
  const created = await sectionsApi.create<{ id: string }>({ name: uniqueName('section-delete'), project_id: ctx.projectId });
  sectionId = created.data.id;
  ctx.set('createdSectionId', sectionId);
});

describe('DELETE /api/v1/sections/{section_id}', () => {
  describe.each(loadSuites('sections', 'delete'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? sectionId;
      const response = await sectionsApi.delete(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 8: Run the sections suite**

Run: `npx jest --config jest.config.ts tests/sections`
Expected: PASS.

- [ ] **Step 9: Regenerate docs and commit**

```bash
npm run docs:generate
git add data/testcases/sections tests/sections docs/test-cases docs/api-behaviour.md
git commit -m "test: cover the sections endpoints with required, optional and negative cases"
```

---

## Task 13: Tasks test suite

**Files:**
- Create: `data/testcases/tasks/create.{required,optional,negative}.json`
- Create: `data/testcases/tasks/list.{required,optional,negative}.json`
- Create: `data/testcases/tasks/get.{required,negative}.json`
- Create: `data/testcases/tasks/update.{required,optional,negative}.json`
- Create: `data/testcases/tasks/delete.{required,negative}.json`
- Create: `tests/tasks/create.test.ts`, `list.test.ts`, `get.test.ts`, `update.test.ts`, `delete.test.ts`

**Interfaces:**
- Consumes: `tasksApi`, `sectionsApi` (Task 5), `resolveCase`/`assertCase` (Task 10)
- Produces: fixture key `createdTaskId`

Field reference, `POST /api/v1/tasks`: required `content` (min length 1);
optional `description`, `project_id`, `section_id`, `parent_id`, `order`,
`labels` (array), `priority` (integer), `assignee_id` (integer),
`due_string`, `due_date`, `due_datetime`, `due_lang`, `duration`
(integer), `duration_unit`, `deadline_date`.
`POST /api/v1/tasks/{task_id}` has no required fields and additionally
accepts `child_order`, `is_collapsed`, `day_order`; `priority` is
constrained to 1 to 4 there.
`GET /api/v1/tasks` accepts `project_id`, `section_id`, `parent_id`,
`label`, `ids`, `cursor`, `limit` (max 200, default 50).
`GET /api/v1/tasks/{task_id}` also accepts `public_key`.
Response schemas: `ItemSyncView`, `PaginatedList_ItemSyncView_`.

- [ ] **Step 1: Write `create.required.json`**

| ID | Title | Payload / assertion |
|---|---|---|
| TC-TASKS-CREATE-REQ-001 | Vytvoření úkolu pouze s povinným polem content | `{"content":"{{uniqueName}}"}`, 200, `ItemSyncView` |
| TC-TASKS-CREATE-REQ-002 | Úkol se založí v zadaném projektu | `{"content":"{{uniqueName}}","project_id":"{{projectId}}"}`, body contains `project_id` |
| TC-TASKS-CREATE-REQ-003 | Server doplní výchozí prioritu 1 | `{"content":"{{uniqueName}}","project_id":"{{projectId}}"}`, body contains `{"priority":1}` |
| TC-TASKS-CREATE-REQ-004 | Nový úkol není dokončený | same payload, body contains `{"checked":false}` |

Before writing case 004, confirm the field name in the response by running
`node -e "..."` against a freshly created task, or by reading
`ItemSyncView` in `data/openapi/todoist-openapi.json`. Use whatever field
the schema actually defines rather than assuming `is_completed`.

- [ ] **Step 2: Write `create.optional.json`**

| ID | Optional field |
|---|---|
| TC-TASKS-CREATE-OPT-001 | `description` |
| TC-TASKS-CREATE-OPT-002 | `section_id` resolved from `{{sectionId}}` |
| TC-TASKS-CREATE-OPT-003 | `parent_id` resolved from `{{taskId}}` (subtask) |
| TC-TASKS-CREATE-OPT-004 | `order: 1` |
| TC-TASKS-CREATE-OPT-005 | `labels: ["qa-auto-label"]` |
| TC-TASKS-CREATE-OPT-006 | `priority: 4` |
| TC-TASKS-CREATE-OPT-007 | `due_string: "tomorrow at 12:00"` |
| TC-TASKS-CREATE-OPT-008 | `due_date: "2027-12-31"` |
| TC-TASKS-CREATE-OPT-009 | `due_datetime: "2027-12-31T10:00:00Z"` |
| TC-TASKS-CREATE-OPT-010 | `due_string: "zítra"` with `due_lang: "cs"` |
| TC-TASKS-CREATE-OPT-011 | `duration: 30` with `duration_unit: "minute"` |
| TC-TASKS-CREATE-OPT-012 | `deadline_date: "2027-12-31"` |
| TC-TASKS-CREATE-OPT-013 | all compatible optional fields at once |

Fixed future dates are used deliberately so the suite does not start
failing once a hard-coded date passes.

- [ ] **Step 3: Write `create.negative.json`**

| ID | Case |
|---|---|
| TC-TASKS-CREATE-NEG-001 | missing `content` |
| TC-TASKS-CREATE-NEG-002 | empty `content` |
| TC-TASKS-CREATE-NEG-003 | `content` is a number |
| TC-TASKS-CREATE-NEG-004 | `content` of 100000 characters (`{{longString:100000}}`) |
| TC-TASKS-CREATE-NEG-005 | `priority: 5` |
| TC-TASKS-CREATE-NEG-006 | `priority: "high"` |
| TC-TASKS-CREATE-NEG-007 | `labels: "one"` |
| TC-TASKS-CREATE-NEG-008 | `project_id: "{{nonExistentId}}"` |
| TC-TASKS-CREATE-NEG-009 | `project_id: "{{malformedId}}"` |
| TC-TASKS-CREATE-NEG-010 | `section_id: "{{nonExistentId}}"` |
| TC-TASKS-CREATE-NEG-011 | `due_date: "31-12-2026"` |
| TC-TASKS-CREATE-NEG-012 | `duration: 30` without `duration_unit` |
| TC-TASKS-CREATE-NEG-013 | `duration_unit: "century"` |
| TC-TASKS-CREATE-NEG-014 | `AUTH_MISSING` |
| TC-TASKS-CREATE-NEG-015 | `AUTH_INVALID` |
| TC-TASKS-CREATE-NEG-016 | `AUTH_MALFORMED` |
| TC-TASKS-CREATE-NEG-017 | `BODY_MALFORMED` |
| TC-TASKS-CREATE-NEG-018 | `BODY_NOT_OBJECT` |

- [ ] **Step 4: Write the list, get, update and delete data files**

`list.required.json`: listing filtered by `project_id: "{{projectId}}"`
returns 200 and `PaginatedList_ItemSyncView_`.
`list.optional.json`: `section_id`, `parent_id`, `label`, `ids`, `limit: 1`,
`limit: 200`.
`list.negative.json`: the five `PAGE_*` rows, `project_id` non-existent,
`project_id` malformed, `ids` malformed, three `AUTH_*`.

`get.required.json`: read back `{{createdTaskId}}`, 200 plus `ItemSyncView`.
`get.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, three `AUTH_*`.

`update.required.json`: change `content` of `{{createdTaskId}}` and verify
the new value.
`update.optional.json`: `description`, `labels`, `priority: 3`,
`due_string`, `due_date`, `duration` plus `duration_unit`, `deadline_date`,
`child_order`, `is_collapsed`, `day_order`.
`update.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, `priority: 0`,
`priority: 5`, `content` empty, `labels` as a string, `BODY_MALFORMED`,
three `AUTH_*`.

`delete.required.json`: delete the task created in `beforeEach`.
`delete.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, double delete,
three `AUTH_*`.

Every `expected.status` comes from the `tasks`, `ids`, `body`, `paging` and
`auth` groups of `docs/api-behaviour.md`. For anything not yet recorded,
add the probe, rerun `npm run probe`, and commit the refreshed file.

- [ ] **Step 5: Write `tests/tasks/create.test.ts`**

```ts
import { sectionsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();

beforeAll(async () => {
  const section = await sectionsApi.create<{ id: string }>({ name: uniqueName('section-tasks'), project_id: ctx.projectId });
  ctx.set('sectionId', section.data.id);

  const parent = await tasksApi.create<{ id: string }>({ content: uniqueName('task-parent'), project_id: ctx.projectId });
  ctx.set('taskId', parent.data.id);
});

describe('POST /api/v1/tasks', () => {
  describe.each(loadSuites('tasks', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await tasksApi.create(resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 6: Write `tests/tasks/list.test.ts`**

```ts
import { tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();

beforeAll(async () => {
  const created = await tasksApi.create<{ id: string }>({ content: uniqueName('task-list'), project_id: ctx.projectId });
  ctx.set('createdTaskId', created.data.id);
});

describe('GET /api/v1/tasks', () => {
  describe.each(loadSuites('tasks', 'list'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await tasksApi.list(resolved.query, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Write `tests/tasks/get.test.ts`**

```ts
import { tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let taskId = '';

beforeAll(async () => {
  const created = await tasksApi.create<{ id: string }>({ content: uniqueName('task-get'), project_id: ctx.projectId });
  taskId = created.data.id;
  ctx.set('createdTaskId', taskId);
});

describe('GET /api/v1/tasks/{task_id}', () => {
  describe.each(loadSuites('tasks', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? taskId;
      const response = await tasksApi.getById(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 8: Write `tests/tasks/update.test.ts` and `tests/tasks/delete.test.ts`**

`update.test.ts`:

```ts
import { tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let taskId = '';

beforeEach(async () => {
  const created = await tasksApi.create<{ id: string }>({ content: uniqueName('task-update'), project_id: ctx.projectId });
  taskId = created.data.id;
  ctx.set('createdTaskId', taskId);
});

describe('POST /api/v1/tasks/{task_id}', () => {
  describe.each(loadSuites('tasks', 'update'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? taskId;
      const response = await tasksApi.update(id, resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`delete.test.ts`:

```ts
import { tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let taskId = '';

beforeEach(async () => {
  const created = await tasksApi.create<{ id: string }>({ content: uniqueName('task-delete'), project_id: ctx.projectId });
  taskId = created.data.id;
  ctx.set('createdTaskId', taskId);
});

describe('DELETE /api/v1/tasks/{task_id}', () => {
  describe.each(loadSuites('tasks', 'delete'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? taskId;
      const response = await tasksApi.delete(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 9: Run the tasks suite**

Run: `npx jest --config jest.config.ts tests/tasks`
Expected: PASS.

- [ ] **Step 10: Regenerate docs and commit**

```bash
npm run docs:generate
git add data/testcases/tasks tests/tasks docs/test-cases docs/api-behaviour.md
git commit -m "test: cover the tasks endpoints with required, optional and negative cases"
```

---

## Task 14: Comments test suite

**Files:**
- Create: `data/testcases/comments/create.{required,optional,negative}.json`
- Create: `data/testcases/comments/list.{required,optional,negative}.json`
- Create: `data/testcases/comments/get.{required,negative}.json`
- Create: `data/testcases/comments/update.{required,negative}.json`
- Create: `data/testcases/comments/delete.{required,negative}.json`
- Create: `tests/comments/create.test.ts`, `list.test.ts`, `get.test.ts`, `update.test.ts`, `delete.test.ts`

**Interfaces:**
- Consumes: `commentsApi`, `tasksApi` (Task 5), `resolveCase`/`assertCase` (Task 10)
- Produces: fixture key `createdCommentId`

Field reference, `POST /api/v1/comments`: required `content`
(min length 1, max length 15000); optional `project_id`, `task_id`,
`attachment` (object), `uids_to_notify` (array). A comment must be attached
to either a task or a project.
`POST /api/v1/comments/{comment_id}` requires `content`.
`GET /api/v1/comments` accepts `project_id`, `task_id`, `cursor`, `limit`,
`public_key`.
Response schemas: `NoteSyncView`, `PaginatedList_NoteSyncView_`.

There is no `update.optional.json` for comments: the update endpoint takes
`content` and nothing else, so there is no optional field to exercise.

- [ ] **Step 1: Write `create.required.json`**

| ID | Title | Payload |
|---|---|---|
| TC-COMMENTS-CREATE-REQ-001 | Vytvoření komentáře u úkolu | `{"content":"{{uniqueName}}","task_id":"{{taskId}}"}` |
| TC-COMMENTS-CREATE-REQ-002 | Vytvoření komentáře u projektu | `{"content":"{{uniqueName}}","project_id":"{{projectId}}"}` |
| TC-COMMENTS-CREATE-REQ-003 | Komentář o délce 15000 znaků projde | `{"content":"{{longString:15000}}","task_id":"{{taskId}}"}` |

- [ ] **Step 2: Write `create.optional.json`**

| ID | Optional field |
|---|---|
| TC-COMMENTS-CREATE-OPT-001 | `uids_to_notify: []` |
| TC-COMMENTS-CREATE-OPT-002 | comment with Unicode and emoji in `content` |
| TC-COMMENTS-CREATE-OPT-003 | comment with markdown formatting in `content` |

- [ ] **Step 3: Write `create.negative.json`**

| ID | Case |
|---|---|
| TC-COMMENTS-CREATE-NEG-001 | missing `content` |
| TC-COMMENTS-CREATE-NEG-002 | empty `content` |
| TC-COMMENTS-CREATE-NEG-003 | `content` is a number |
| TC-COMMENTS-CREATE-NEG-004 | `content` of 15001 characters |
| TC-COMMENTS-CREATE-NEG-005 | neither `task_id` nor `project_id` |
| TC-COMMENTS-CREATE-NEG-006 | both `task_id` and `project_id` |
| TC-COMMENTS-CREATE-NEG-007 | `task_id: "{{nonExistentId}}"` |
| TC-COMMENTS-CREATE-NEG-008 | `task_id: "{{malformedId}}"` |
| TC-COMMENTS-CREATE-NEG-009 | `project_id: "{{nonExistentId}}"` |
| TC-COMMENTS-CREATE-NEG-010 | `uids_to_notify` is a string |
| TC-COMMENTS-CREATE-NEG-011 | `AUTH_MISSING` |
| TC-COMMENTS-CREATE-NEG-012 | `AUTH_INVALID` |
| TC-COMMENTS-CREATE-NEG-013 | `AUTH_MALFORMED` |
| TC-COMMENTS-CREATE-NEG-014 | `BODY_MALFORMED` |
| TC-COMMENTS-CREATE-NEG-015 | `BODY_NOT_OBJECT` |

- [ ] **Step 4: Write the list, get, update and delete data files**

`list.required.json`: listing by `task_id: "{{taskId}}"` returns 200 and
`PaginatedList_NoteSyncView_`.
`list.optional.json`: listing by `project_id`, `limit: 1`, `limit: 200`.
`list.negative.json`: the five `PAGE_*` rows, listing with neither
`task_id` nor `project_id`, `task_id` non-existent, `task_id` malformed,
three `AUTH_*`.

`get.required.json`: read back `{{createdCommentId}}`.
`get.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, three `AUTH_*`.

`update.required.json`: change `content` of `{{createdCommentId}}` and
verify the new value comes back.
`update.negative.json`: missing `content`, empty `content`, `content` of
15001 characters, `ID_NONEXISTENT`, `ID_MALFORMED`, `BODY_MALFORMED`,
three `AUTH_*`.

`delete.required.json`: delete the comment created in `beforeEach`.
`delete.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, double delete,
three `AUTH_*`.

- [ ] **Step 5: Write `tests/comments/create.test.ts`**

```ts
import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();

beforeAll(async () => {
  const task = await tasksApi.create<{ id: string }>({ content: uniqueName('task-comments'), project_id: ctx.projectId });
  ctx.set('taskId', task.data.id);
});

describe('POST /api/v1/comments', () => {
  describe.each(loadSuites('comments', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await commentsApi.create(resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 6: Write `tests/comments/list.test.ts`**

```ts
import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();

beforeAll(async () => {
  const task = await tasksApi.create<{ id: string }>({ content: uniqueName('task-comments-list'), project_id: ctx.projectId });
  ctx.set('taskId', task.data.id);
  await commentsApi.create({ content: uniqueName('comment-list'), task_id: task.data.id });
});

describe('GET /api/v1/comments', () => {
  describe.each(loadSuites('comments', 'list'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await commentsApi.list(resolved.query, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Write `tests/comments/get.test.ts`, `update.test.ts` and `delete.test.ts`**

`get.test.ts` creates the fixture once:

```ts
import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let commentId = '';

beforeAll(async () => {
  const task = await tasksApi.create<{ id: string }>({ content: uniqueName('task-comment-get'), project_id: ctx.projectId });
  const comment = await commentsApi.create<{ id: string }>({ content: uniqueName('comment-get'), task_id: task.data.id });
  commentId = comment.data.id;
  ctx.set('createdCommentId', commentId);
});

describe('GET /api/v1/comments/{comment_id}', () => {
  describe.each(loadSuites('comments', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? commentId;
      const response = await commentsApi.getById(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`update.test.ts` recreates the fixture per case:

```ts
import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let commentId = '';
let taskId = '';

beforeAll(async () => {
  const task = await tasksApi.create<{ id: string }>({ content: uniqueName('task-comment-update'), project_id: ctx.projectId });
  taskId = task.data.id;
});

beforeEach(async () => {
  const comment = await commentsApi.create<{ id: string }>({ content: uniqueName('comment-update'), task_id: taskId });
  commentId = comment.data.id;
  ctx.set('createdCommentId', commentId);
});

describe('POST /api/v1/comments/{comment_id}', () => {
  describe.each(loadSuites('comments', 'update'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? commentId;
      const response = await commentsApi.update(id, resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`delete.test.ts` is the same file with `commentsApi.delete(id, resolved.options)`
as the call and `loadSuites('comments', 'delete')` as the data source:

```ts
import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let commentId = '';
let taskId = '';

beforeAll(async () => {
  const task = await tasksApi.create<{ id: string }>({ content: uniqueName('task-comment-delete'), project_id: ctx.projectId });
  taskId = task.data.id;
});

beforeEach(async () => {
  const comment = await commentsApi.create<{ id: string }>({ content: uniqueName('comment-delete'), task_id: taskId });
  commentId = comment.data.id;
  ctx.set('createdCommentId', commentId);
});

describe('DELETE /api/v1/comments/{comment_id}', () => {
  describe.each(loadSuites('comments', 'delete'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? commentId;
      const response = await commentsApi.delete(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 8: Run the comments suite**

Run: `npx jest --config jest.config.ts tests/comments`
Expected: PASS.

- [ ] **Step 9: Regenerate docs and commit**

```bash
npm run docs:generate
git add data/testcases/comments tests/comments docs/test-cases docs/api-behaviour.md
git commit -m "test: cover the comments endpoints with required, optional and negative cases"
```

---

## Task 15: Labels test suite

**Files:**
- Create: `data/testcases/labels/create.{required,optional,negative}.json`
- Create: `data/testcases/labels/list.{required,optional,negative}.json`
- Create: `data/testcases/labels/get.{required,negative}.json`
- Create: `data/testcases/labels/update.{required,optional,negative}.json`
- Create: `data/testcases/labels/delete.{required,negative}.json`
- Create: `tests/labels/create.test.ts`, `list.test.ts`, `get.test.ts`, `update.test.ts`, `delete.test.ts`

**Interfaces:**
- Consumes: `labelsApi` (Task 5), `resolveCase`/`assertCase` (Task 10)
- Produces: fixture key `createdLabelId`

Field reference, `POST /api/v1/labels`: required `name` (min length 1, max
length 128); optional `order`, `color` (default `charcoal`), `is_favorite`
(default `false`).
`POST /api/v1/labels/{label_id}` has no required fields and accepts `name`,
`order`, `color`, `is_favorite`. Note that the spec types the `label_id`
path parameter as an **integer** while the other resources use strings;
record what the API actually accepts in `docs/api-behaviour.md` and write
the data files to match.
`GET /api/v1/labels` accepts `cursor` and `limit` only.
Response schemas: `LabelRestView`, `PaginatedList_LabelRestView_`.

Labels are account-global. Every label created here must use a name
starting with `qa-auto-` so `globalTeardown` removes it.

- [ ] **Step 1: Write `create.required.json`**

| ID | Title | Payload / assertion |
|---|---|---|
| TC-LABELS-CREATE-REQ-001 | Vytvoření labelu pouze s povinným polem name | `{"name":"{{uniqueName}}"}`, 200, `LabelRestView` |
| TC-LABELS-CREATE-REQ-002 | Server doplní výchozí barvu charcoal | body contains `{"color":"charcoal"}` |
| TC-LABELS-CREATE-REQ-003 | Server doplní is_favorite na false | body contains `{"is_favorite":false}` |
| TC-LABELS-CREATE-REQ-004 | Název o délce 128 znaků projde | `{"name":"{{longString:128}}"}` |

Case 004 produces a label whose name does not start with `qa-auto-`, so
`tests/labels/create.test.ts` deletes every label it creates in `afterAll`
rather than relying on the prefix cleanup.

- [ ] **Step 2: Write `create.optional.json`**

| ID | Optional field |
|---|---|
| TC-LABELS-CREATE-OPT-001 | `order: 1` |
| TC-LABELS-CREATE-OPT-002 | `color` as a string (`teal`) |
| TC-LABELS-CREATE-OPT-003 | `color` as an integer (`42`) |
| TC-LABELS-CREATE-OPT-004 | `is_favorite: true` |
| TC-LABELS-CREATE-OPT-005 | all optional fields at once |

- [ ] **Step 3: Write `create.negative.json`**

| ID | Case |
|---|---|
| TC-LABELS-CREATE-NEG-001 | missing `name` |
| TC-LABELS-CREATE-NEG-002 | empty `name` |
| TC-LABELS-CREATE-NEG-003 | `name` is a number |
| TC-LABELS-CREATE-NEG-004 | `name` of 129 characters |
| TC-LABELS-CREATE-NEG-005 | `color: "not_a_color"` |
| TC-LABELS-CREATE-NEG-006 | `order` is a string |
| TC-LABELS-CREATE-NEG-007 | `is_favorite: "yes"` |
| TC-LABELS-CREATE-NEG-008 | duplicate name of an existing label |
| TC-LABELS-CREATE-NEG-009 | `AUTH_MISSING` |
| TC-LABELS-CREATE-NEG-010 | `AUTH_INVALID` |
| TC-LABELS-CREATE-NEG-011 | `AUTH_MALFORMED` |
| TC-LABELS-CREATE-NEG-012 | `BODY_MALFORMED` |
| TC-LABELS-CREATE-NEG-013 | `BODY_NOT_OBJECT` |

Case 008 needs a label that already exists. The test file creates
`qa-auto-duplicate` in `beforeAll` and exposes it as `{{duplicateLabelName}}`.

- [ ] **Step 4: Write the list, get, update and delete data files**

`list.required.json`: default listing returns 200 and
`PaginatedList_LabelRestView_`.
`list.optional.json`: `limit: 1`, `limit: 200`.
`list.negative.json`: the five `PAGE_*` rows and three `AUTH_*`.

`get.required.json`: read back `{{createdLabelId}}`.
`get.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, three `AUTH_*`.

`update.required.json`: rename `{{createdLabelId}}`.
`update.optional.json`: `order`, `color`, `is_favorite`.
`update.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, empty `name`,
`name` of 129 characters, invalid `color`, `BODY_MALFORMED`, three `AUTH_*`.

`delete.required.json`: delete the label created in `beforeEach`.
`delete.negative.json`: `ID_NONEXISTENT`, `ID_MALFORMED`, double delete,
three `AUTH_*`.

- [ ] **Step 5: Write `tests/labels/create.test.ts`**

```ts
import { labelsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';

const ctx = new TestContext();
const createdIds: string[] = [];

beforeAll(async () => {
  const duplicate = await labelsApi.create<{ id: string; name: string }>({ name: 'qa-auto-duplicate' });
  createdIds.push(duplicate.data.id);
  ctx.set('duplicateLabelName', duplicate.data.name);
});

afterAll(async () => {
  for (const id of createdIds) {
    await labelsApi.delete(id);
  }
});

describe('POST /api/v1/labels', () => {
  describe.each(loadSuites('labels', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await labelsApi.create<{ id?: string }>(resolved.payload, resolved.options);

      if (response.status === 200 && response.data?.id) {
        createdIds.push(response.data.id);
      }

      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 6: Write `tests/labels/list.test.ts`**

```ts
import { labelsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let labelId = '';

beforeAll(async () => {
  const created = await labelsApi.create<{ id: string }>({ name: uniqueName('label-list') });
  labelId = created.data.id;
});

afterAll(async () => {
  await labelsApi.delete(labelId);
});

describe('GET /api/v1/labels', () => {
  describe.each(loadSuites('labels', 'list'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const response = await labelsApi.list(resolved.query, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 7: Write `tests/labels/get.test.ts`, `update.test.ts` and `delete.test.ts`**

`get.test.ts`:

```ts
import { labelsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let labelId = '';

beforeAll(async () => {
  const created = await labelsApi.create<{ id: string }>({ name: uniqueName('label-get') });
  labelId = created.data.id;
  ctx.set('createdLabelId', labelId);
});

afterAll(async () => {
  await labelsApi.delete(labelId);
});

describe('GET /api/v1/labels/{label_id}', () => {
  describe.each(loadSuites('labels', 'get'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? labelId;
      const response = await labelsApi.getById(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`update.test.ts`:

```ts
import { labelsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let labelId = '';

beforeEach(async () => {
  const created = await labelsApi.create<{ id: string }>({ name: uniqueName('label-update') });
  labelId = created.data.id;
  ctx.set('createdLabelId', labelId);
});

afterEach(async () => {
  await labelsApi.delete(labelId);
});

describe('POST /api/v1/labels/{label_id}', () => {
  describe.each(loadSuites('labels', 'update'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? labelId;
      const response = await labelsApi.update(id, resolved.payload, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

`delete.test.ts`:

```ts
import { labelsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { loadSuites } from '../../src/support/loadTestCases';
import { assertCase, resolveCase } from '../../src/support/runSuite';
import { uniqueName } from '../../src/support/TestDataFactory';

const ctx = new TestContext();
let labelId = '';

beforeEach(async () => {
  const created = await labelsApi.create<{ id: string }>({ name: uniqueName('label-delete') });
  labelId = created.data.id;
  ctx.set('createdLabelId', labelId);
});

afterEach(async () => {
  await labelsApi.delete(labelId);
});

describe('DELETE /api/v1/labels/{label_id}', () => {
  describe.each(loadSuites('labels', 'delete'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (testCase) => {
      const resolved = resolveCase(testCase, ctx);
      const id = resolved.pathParams.id ?? labelId;
      const response = await labelsApi.delete(id, resolved.options);
      assertCase(response, resolved);
    });
  });
});
```

- [ ] **Step 8: Run the labels suite and confirm no labels leak**

Run: `npx jest --config jest.config.ts tests/labels`
Expected: PASS.

Then run:
`node -e "fetch('https://api.todoist.com/api/v1/labels?limit=200',{headers:{Authorization:'Bearer '+process.env.TODOIST_API_TOKEN}}).then(r=>r.json()).then(d=>console.log(d.results.map(l=>l.name).join(', ')))"`
Expected: no name starting with `qa-auto-` and no 128-character name.

- [ ] **Step 9: Regenerate docs and commit**

```bash
npm run docs:generate
git add data/testcases/labels tests/labels docs/test-cases docs/api-behaviour.md
git commit -m "test: cover the labels endpoints with required, optional and negative cases"
```

---

## Task 16: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/api-tests.yml`

**Interfaces:**
- Consumes: npm scripts `docs:check` and `test` (Tasks 1 and 9)
- Produces: a scheduled run at 07:00 Europe/Prague with HTML and JUnit
  artifacts

The schedule uses two UTC crons because GitHub Actions has no timezone
support: `0 5 * * *` is 07:00 Prague during CEST and `0 6 * * *` is 07:00
Prague during CET. A guard job reads the current Prague hour and lets only
the correct one through, so exactly one run happens per day all year.

- [ ] **Step 1: Write `.github/workflows/api-tests.yml`**

```yaml
name: API tests

on:
  schedule:
    # 07:00 Europe/Prague during CEST (summer)
    - cron: '0 5 * * *'
    # 07:00 Europe/Prague during CET (winter)
    - cron: '0 6 * * *'
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: read

# One account, one suite: never let two runs touch the data at the same time.
concurrency:
  group: todoist-api-tests
  cancel-in-progress: false

jobs:
  guard:
    name: Check Prague time
    runs-on: ubuntu-latest
    outputs:
      run: ${{ steps.check.outputs.run }}
    steps:
      - id: check
        shell: bash
        run: |
          if [ "${{ github.event_name }}" != "schedule" ]; then
            echo "Triggered by ${{ github.event_name }}; running."
            echo "run=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          HOUR=$(TZ=Europe/Prague date +%H)
          echo "Current hour in Europe/Prague: $HOUR"

          if [ "$HOUR" = "07" ]; then
            echo "run=true" >> "$GITHUB_OUTPUT"
          else
            echo "Not 07:00 in Prague, skipping this cron."
            echo "run=false" >> "$GITHUB_OUTPUT"
          fi

  test:
    name: Run Todoist API tests
    needs: guard
    if: needs.guard.outputs.run == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      TODOIST_API_TOKEN: ${{ secrets.TODOIST_API_TOKEN }}
      TODOIST_BASE_URL: https://api.todoist.com
      TEST_PROJECT_PREFIX: QA-Automation
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Verify the API token secret is present
        run: |
          if [ -z "$TODOIST_API_TOKEN" ]; then
            echo "::error::The TODOIST_API_TOKEN secret is not set in this repository."
            exit 1
          fi

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm run test:unit

      - name: Check that the test-case documentation is up to date
        run: npm run docs:check

      - name: API tests
        run: npm test

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-reports-${{ github.run_number }}
          path: |
            reports/html
            reports/junit.xml
          retention-days: 30
          if-no-files-found: warn
```

- [ ] **Step 2: Validate the workflow syntax locally**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/api-tests.yml','utf8');if(!/cron: '0 5 \* \* \*'/.test(y)||!/cron: '0 6 \* \* \*'/.test(y))throw new Error('crons missing');console.log('crons present')"`
Expected: `crons present`.

- [ ] **Step 3: Verify the guard logic by hand**

Run: `TZ=Europe/Prague date +%H` and confirm it prints the current Prague
hour. Then confirm the mapping with:
`TZ=UTC date -d '2026-07-01 05:00' +%s | xargs -I{} sh -c 'TZ=Europe/Prague date -d @{} +%H'`
Expected: `07`. Repeat with `2026-12-01 06:00`, which must also print `07`.

- [ ] **Step 4: Add the repository secret**

The token cannot be added from this session. Do it once in the GitHub UI:
Settings, Secrets and variables, Actions, New repository secret, name
`TODOIST_API_TOKEN`, value taken from the local `.env`. Then trigger the
workflow manually from the Actions tab and confirm the run is green and the
`api-test-reports-*` artifact is attached.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/api-tests.yml
git commit -m "ci: run the API suite daily at 07:00 Europe/Prague"
```

---

## Task 17: README and full-suite verification

**Files:**
- Create: `README.md`
- Modify: none

**Interfaces:**
- Consumes: everything built in Tasks 1 to 16
- Produces: the entry point a new engineer reads first

- [ ] **Step 1: Write `README.md`**

````markdown
# Todoist API test automation

Data-driven regression suite for the public Todoist REST API v1, written in
TypeScript on Jest. Runs locally and in GitHub Actions every day at 07:00
Europe/Prague.

## Quick start

```bash
npm ci
cp .env.example .env      # then fill in TODOIST_API_TOKEN
npm test
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | full API suite against the live account |
| `npm run test:unit` | framework unit tests, no network |
| `npm run docs:generate` | regenerates `docs/test-cases/**` from the JSON data |
| `npm run docs:check` | fails when the documentation is stale (used in CI) |
| `npm run probe` | records real API behaviour into `docs/api-behaviour.md` |
| `npm run spec:update` | refreshes the vendored OpenAPI spec |
| `npm run lint` | ESLint over the whole repository |

## How it fits together

- `src/core` holds the HTTP client and the AJV schema validator.
- `src/endpoints` holds one service object per resource. Tests never build
  URLs themselves.
- `data/testcases/<resource>/<operation>.<kind>.json` holds the test data.
  `kind` is `required`, `optional` or `negative`.
- `tests/<resource>/<operation>.test.ts` reads that data and asserts status,
  schema and body through `resolveCase` and `assertCase`.
- `docs/test-cases/**` is generated documentation, one Czech markdown file
  per test case. Never edit it by hand.

## Adding a test case

1. Add the case to the matching JSON file in `data/testcases/`.
2. Take the expected status from `docs/api-behaviour.md`. If the scenario is
   not recorded there, add it to `scripts/probe-negatives.ts` and run
   `npm run probe`.
3. Run `npm run docs:generate`.
4. Run `npm test` and commit the data file, the docs and any refreshed
   behaviour table together.

## Test data isolation

`globalSetup` creates a project named `QA-Automation-<timestamp>` and
`globalTeardown` deletes it, so nothing survives a run. Labels are global to
the account and are cleaned by the `qa-auto-` name prefix. The suite runs
single-threaded because the whole account is shared state.

## Secrets

The API token lives in `.env` locally, which is git-ignored, and in the
`TODOIST_API_TOKEN` repository secret in CI. Rotate the token in Todoist
settings if it is ever pasted anywhere outside those two places.

## Scope

Covered: user, projects, sections, tasks, comments, labels. Not covered:
endpoints that require a Premium or Business plan (workspaces, payments,
billing, backups, templates, reminders, activities, uploads, filters), the
Sync API, load testing and the web UI.
````

- [ ] **Step 2: Run the whole suite from a clean state**

```bash
rm -rf .tmp reports
npm run lint
npm run test:unit
npm run docs:check
npm test
```

Expected: all four commands exit 0. Record the total number of API test
cases reported by Jest; it should be roughly 300.

- [ ] **Step 3: Verify the account is clean**

```bash
node -e "const t=process.env.TODOIST_API_TOKEN;const h={Authorization:'Bearer '+t};Promise.all([fetch('https://api.todoist.com/api/v1/projects?limit=200',{headers:h}).then(r=>r.json()),fetch('https://api.todoist.com/api/v1/labels?limit=200',{headers:h}).then(r=>r.json())]).then(([p,l])=>{console.log('leftover projects:',p.results.filter(x=>x.name.startsWith('QA-Automation-')||x.name.startsWith('qa-auto-')).map(x=>x.name));console.log('leftover labels:',l.results.filter(x=>x.name.startsWith('qa-auto-')).map(x=>x.name));})"
```

Expected: both arrays empty.

- [ ] **Step 4: Confirm the reports exist**

```bash
ls reports/junit.xml reports/html/index.html
```

Expected: both files listed. Open `reports/html/index.html` in a browser and
confirm the case IDs appear in the test titles.

- [ ] **Step 5: Confirm no secret is tracked**

```bash
git ls-files | grep -c '^\.env$'
git grep -nIE '\b[0-9a-f]{40}\b' -- . ':!node_modules' ':!package-lock.json' | wc -l
```

Expected: `0` from both commands. The second pattern matches any 40-character
hex string, which is the shape of a Todoist personal API token, so it catches
an accidentally committed token without hard-coding the secret into this plan.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document how to run and extend the suite"
```

---

## Definition of Done

- `npm run lint`, `npm run test:unit`, `npm run docs:check` and `npm test`
  all pass from a clean checkout.
- All 26 endpoints in scope have `required` and `negative` data files, and
  every endpoint that accepts optional input also has an `optional` file.
- Every negative `expected.status` traces to a row in
  `docs/api-behaviour.md`.
- `docs/test-cases/` contains one Czech markdown file per test case plus a
  `README.md` index, and `npm run docs:check` is clean.
- The GitHub Actions workflow has run green at least once from
  `workflow_dispatch` and has produced the report artifact.
- The Todoist account contains no leftover `QA-Automation-` project and no
  leftover `qa-auto-` label after a run.
- `.env` is untracked and the token string appears nowhere in the repository.
