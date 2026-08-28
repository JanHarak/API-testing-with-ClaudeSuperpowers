# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Jest + TypeScript API test suite for the Todoist REST API v1. Tests run against a **real
Todoist account over the live network** — there is no mock server and no fixture replay.

## Commands

There are **two Jest configs** and picking the wrong one silently runs nothing:

| Command | Config | Scope |
| --- | --- | --- |
| `npm test` | `jest.config.ts` | `tests/**/*.test.ts` — hits the live API |
| `npm run test:unit` | `jest.unit.config.ts` | `src/**/*.spec.ts` — offline, no network |
| `npm run lint` | — | ESLint over the repo |
| `npm run format` | — | Prettier write |
| `npm run spec:update` | — | Re-downloads `data/openapi/todoist-openapi.json` |

Single file or single test:

```bash
npx jest --config jest.unit.config.ts src/core/HttpClient.spec.ts
npx jest --config jest.config.ts tests/smoke/tasks.test.ts
npx jest --config jest.config.ts -t 'creates a task'
```

`npm test` requires `.env` (copy from `.env.example`) with a real `TODOIST_API_TOKEN`.
Reports land in `reports/` — `junit.xml` and `html/index.html`.

`package.json` also declares `docs:generate`, `docs:check` and `probe`. **Their scripts do
not exist yet** (planned Tasks 8 and 9); those commands currently fail.

## Architecture

Four layers, each depending only on the one above it:

```
src/core/       HttpClient, ApiEndpoint, SchemaValidator, types      — no Todoist knowledge
src/endpoints/  UserApi, ProjectsApi, SectionsApi, TasksApi,          — one class per resource
                CommentsApi, LabelsApi
src/support/    env, apis, run isolation, matchers                    — wiring and fixtures
tests/          smoke suites                                          — assertions only
```

Things that are not obvious from any single file:

**`HttpClient` never throws on a non-2xx.** It returns `ApiResponse { status, statusText,
headers, data, raw, durationMs }` so a test can assert on error envelopes. It throws only on
transport failure. `RequestOptions` deliberately exposes escape hatches for building
*invalid* requests: `token: null` omits the `Authorization` header entirely, `authHeader`
replaces the whole header value, `rawBody` is sent verbatim instead of `JSON.stringify(body)`.
It retries on `429 || >= 5xx`, honouring `Retry-After`.

**`ApiEndpoint`'s protected helpers are named `sendGet` / `sendPost` / `sendDelete`, not
`get` / `post` / `delete`.** This is required, not stylistic: `UserApi` exposes a public
`get()` and `LabelsApi` a public `delete()`, and a protected base member of the same name is
an illegal override in TypeScript. Do not "tidy" these names.

**Endpoint methods take `payload: unknown`.** Negative tests must be able to send bodies a
typed interface would reject at compile time. Do not tighten these signatures.

**Schema assertions come from the vendored OpenAPI spec.** `SchemaValidator` compiles
`data/openapi/todoist-openapi.json` with Ajv and `schemaValidator.validate(name, data)`
**throws** on an unknown schema name rather than returning `{ valid: false }`. Two custom
matchers are registered via `setupFilesAfterEnv` in `jest.config.ts`:

```ts
expect(response).toHaveStatus(200);          // on the whole ApiResponse
expect(response.data).toMatchApiSchema('ItemSyncView');   // on response.data
```

Schema names per resource: `UserJSON`, `AnyProjectSyncViewResponse`, `SectionSyncView`,
`ItemSyncView`, `NoteSyncView`, `LabelRestView`; collections use `PaginatedList_<View>_`.

## Test data isolation — read before writing any test

The account is real, so isolation is load-bearing:

- `globalSetup` creates one sandbox project `QA-Automation-<timestamp>` and writes it to
  `.tmp/test-run.json`. It also sweeps sandbox projects from runs older than two hours,
  because a free account caps active projects and a crashed run would block later ones.
- `TestContext` reads that file; `context.projectId` is where **every** test must create
  data. Never write to the Inbox or to a pre-existing project.
- `globalTeardown` deletes the sandbox project, which cascades to its sections, tasks and
  comments. Labels are account-wide, so they are swept separately by the `qa-auto-` prefix —
  name labels with `uniqueLabelName()`.
- Nothing lacking the configured prefix is ever deleted.

`maxWorkers: 1` is mandatory: Todoist rate limits per user, and parallel workers would race
over the shared sandbox project. The smoke suites are lifecycle walks (create → list → get →
update → delete) that share state across `it` blocks and therefore rely on Jest's
declaration order plus the single worker.

## Live API behaviours that contradict the OpenAPI document

Verified by probing the live API. Do not take expected statuses from the spec, and do not
guess them.

- `DELETE` returns **204** with an empty body, not the 200 the spec lists. It is idempotent.
- Deletes are **soft**: the resource stays readable afterwards with `is_deleted: true` but
  drops out of its collection. Assert against the list, not a follow-up `GET`.
- A malformed resource ID gives **400 `INVALID_ARGUMENT_VALUE`**, not 404 — IDs are a base32
  variant the API validates before any lookup.
- `NON_EXISTENT_ID` in `TestDataFactory` is **not uniform**: 404 on tasks and labels, but
  **400 on projects**, whose IDs carry a checksum. Negative cases need a per-resource status.
- Label IDs are numeric strings; every other resource uses base32 IDs.
- `GET /comments` requires a `task_id` or `project_id` filter; unfiltered is 400.
- Auth failures split: a missing or unknown bearer token is **401 `UNAUTHORIZED`**, but a
  structurally broken `Authorization` header is **403 `AUTH_INVALID_AUTHENTICATION_HEADER`**.
- Todoist uses `POST` for updates — never `PUT` or `PATCH`.
- Error envelope: `{ error, error_code, error_tag, http_code, error_extra: { argument, expected, retry_after } }`.

## Scope

In scope: 26 endpoints across six resources (user, projects, sections, tasks, comments,
labels). The test account is **free** (`is_premium: false`), so workspaces, payments, usage
billing, backups, templates, reminders, activities, uploads and filters are out of scope and
return `PREMIUM_ONLY` or `WORKSPACE_NOT_FOUND`.

Current state is **smoke coverage only** — every endpoint exercised once for status and
schema. The data-driven test-case layer (`data/testcases/`), its loader, the negative
behaviour probe, the docs generator and the ~300-case required/optional/negative matrix are
designed but not built.

## Working in this repository

The build follows a spec-driven workflow with three governing documents. Read them before
making design decisions:

1. `docs/superpowers/specs/2026-08-28-todoist-api-testing-design.md` — binding authority
2. `docs/superpowers/plans/2026-08-28-todoist-api-testing.md` — 17 tasks argued from the spec
3. `docs/superpowers/HANDOFF.md` — **live status, rulings taken, deferred findings**

`HANDOFF.md` is the continuity mechanism between sessions and is committed deliberately
(`.superpowers/` is git-ignored and may not survive). Update it when you finish a task,
take a decision on the user's behalf, or discover an API behaviour.

Work happens on `feat/todoist-api-tests`; `main` holds only the spec, plan and `.gitignore`.

**Windows gotcha:** Jest 29 corrupts its glob-based `testMatch` when an ancestor directory
starts with a dot — the run reports `0 matches` and every test silently disappears. Never
place this checkout (or a worktree of it) under `.claude/worktrees/` or similar. CI on Linux
is unaffected. Relatedly, Git Bash on Windows ignores `TZ` for `date -d`; verify timezone
logic with Node's `Intl.DateTimeFormat`.
