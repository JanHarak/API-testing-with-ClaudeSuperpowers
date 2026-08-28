# Handoff — Todoist API test suite

Last updated: 2026-08-28, after the smoke suite went green end to end.

This file is committed on branch `feat/todoist-api-tests` so a fresh agent can resume
without the previous session's context. The live SDD ledger lives at
`.superpowers/sdd/2026-08-28-todoist-api-testing/progress.md`, but `.superpowers/` is
git-ignored and may not survive — everything that matters is duplicated here.

## Scope change: smoke first

The user narrowed the scope mid-build:

> "zaměř se pouze na smoke testy, na prověření že volání fungují"

So the work jumped from Task 6 straight to a smoke suite plus the CI workflow. The
~300-case required/optional/negative matrix (Tasks 7–15) is **deferred, not cancelled**.
The spec and plan still describe it and remain the design of record.

## Where the work is

- Branch: `feat/todoist-api-tests`, checked out in the repository itself
- `main` holds only the design spec, the implementation plan and `.gitignore`
- Merge back into `main` happens only after the final whole-branch review

## The two documents that govern this work

1. Spec (the binding authority): `docs/superpowers/specs/2026-08-28-todoist-api-testing-design.md`
2. Plan (17 tasks, argues from the spec): `docs/superpowers/plans/2026-08-28-todoist-api-testing.md`

## Status

| Task | State | Commit |
|---|---|---|
| 1. Scaffolding, env loader, vendored OpenAPI spec | complete, review clean | `9ee8444` |
| 2. SchemaValidator over the OpenAPI spec | complete, review clean | `f79ad34` |
| 3. HttpClient | complete, review clean after 1 fix round | `282b5c4`, `7415399` |
| 4. ApiEndpoint base + Jest matchers | committed, **review still not done** | `3ed4795` |
| 5. Endpoint classes for all six resources | complete, 29 unit tests | this session |
| 6. Run isolation, fixtures and cleanup | complete (two deviations, below) | this session |
| **Smoke suite** (not a numbered task) | complete, 27 tests green | this session |
| 16. GitHub Actions workflow | complete, minus the `docs:check` step | this session |
| 7–15, 17 | deferred by the scope change | — |

Tests currently passing: **49 unit** (`env`, `SchemaValidator`, `HttpClient`, `matchers`,
`endpoints`) and **27 smoke** against the live API.

Verified after a full run: the account is left with only `Inbox` and the user's own
`ai api claude` project; zero leftover tasks and zero leftover labels.

## What the smoke suite covers

`tests/smoke/<resource>.test.ts`, one file per resource, walking each resource's
operations as a lifecycle because create is the only source of an addressable ID:

- `user.test.ts` — `GET /user` happy path plus a `token: null` 401
- `projects.test.ts`, `sections.test.ts`, `tasks.test.ts`, `comments.test.ts`,
  `labels.test.ts` — create → list → get → update → delete

Every step asserts the HTTP status and validates the body with
`toMatchApiSchema` against the vendored OpenAPI schema, so all 26 in-scope endpoints are
proven to be reachable, authenticated and shape-correct.

Ordering relies on Jest running tests in declaration order within a `describe` plus
`maxWorkers: 1`. Both hold; do not raise `maxWorkers`.

## Deviations taken in Task 6

Each was a decision made on the user's behalf. Revisit if wrong.

1. **`globalSetup` also sweeps stale sandbox projects** (prefix-matched AND older than
   two hours). The spec assigns the leftover sweep to teardown only, but a free Todoist
   account caps active projects, so a crashed run would eventually block all later runs.
   The two-hour age gate keeps it from deleting a project a concurrent run is using.
2. **`resolvePlaceholders` was not implemented.** Task 6 lists it, but it exists only to
   serve the data-driven test-case layer, which the scope change deferred. Add it with
   Task 7.

## Findings from probing the live API

Recorded here because Task 8 (`scripts/probe-negatives.ts` → `docs/api-behaviour.md`)
has not been built, and the negative matrix must not guess statuses.

- **`NON_EXISTENT_ID = '6X4rfFVWjhSj9Vc9'` does not behave uniformly.** Verified live:
  `GET /tasks/{id}` → 404, `GET /labels/{id}` → 404, but `GET /projects/{id}` → **400**.
  Project IDs carry a checksum the API validates before any lookup, so a well-formed but
  unused project ID must be derived by mutating a real one, not hard-coded. Every
  negative case built on this constant needs a per-resource expected status.
- `MALFORMED_ID = '!!!not-an-id!!!'` → 400 on projects and tasks, 404 on labels.
- DELETE returns **204** with an empty body, not the 200 the OpenAPI document lists.
- DELETE is soft: the resource stays readable afterwards with `is_deleted: true`, but
  drops out of its collection. Assert against the list, not a follow-up GET.
- Label IDs are numeric strings; every other resource uses base32 IDs.
- `GET /comments` requires a `task_id` or `project_id` filter — an unfiltered call is
  rejected with 400.

## Do this first

Task 4's review never completed — the reviewer subagent died on a session rate limit
mid-run, so its verdict is unknown. It has since been built on by Tasks 5, 6 and the
smoke suite, all of which are green, which is circumstantial evidence but not a review.

Two things to point a reviewer at, because the tests may not distinguish them: whether
both matchers' `message` functions read correctly in the NEGATED direction
(`expect(...).not.toHaveStatus(...)`), and what `toMatchApiSchema` does when
`schemaValidator.validate` THROWS on an unknown schema name rather than returning
`{ valid: false }` — the deferred matrix will pass schema names in from JSON data files,
where a typo is plausible.

## Environment gotchas that cost time already

1. **Never place this checkout under a dot-prefixed directory.** Jest 29 on Windows
   corrupts its glob-based `testMatch` when an ancestor directory starts with a dot: the
   run reports `0 matches` and every test silently disappears. The original worktree was
   created under `.claude/worktrees/` and had to be moved for exactly this reason. CI on
   Linux is unaffected.
2. `.env` is git-ignored and therefore absent from a fresh checkout. Recreate it from
   `.env.example` with a real Todoist personal API token before running `npm test`.
3. The account under test is free (`is_premium: false`). Premium endpoints are out of
   scope — see spec chapter 2.
4. **The free plan caps active projects.** Hitting it returns
   403 `MAX_PROJECTS_LIMIT_REACHED`. Keep the suite frugal: create a project, use it,
   delete it.
5. Git Bash on Windows does not honour `TZ` for `date -d`. Verify timezone logic with
   Node's `Intl.DateTimeFormat` instead; the CI guard job runs on Ubuntu where `TZ` works.

## CI

`.github/workflows/api-tests.yml` — daily at 07:00 Europe/Prague via two UTC crons
(`0 5` and `0 6`) plus a guard job that reads the real Prague hour, so exactly one run
happens per day year-round. Verified by computation for both a summer and a winter date.

The `docs:check` step from the plan's Task 16 was **omitted**: `package.json` still
declares the script, but `scripts/generate-test-docs.ts` (Task 9) does not exist and the
step would fail. Restore it with Task 9.

**Still to do by hand:** add the `TODOIST_API_TOKEN` repository secret in the GitHub UI
(Settings → Secrets and variables → Actions), then trigger the workflow manually and
confirm the run is green with an `api-test-reports-*` artifact attached.

## Interfaces later tasks depend on

- `loadEnv(): EnvConfig` — `{ token, baseUrl, testProjectPrefix, httpLog }`
- `schemaValidator.validate(schemaName, data): { valid, errors }` — throws on an unknown
  schema name
- `HttpClient.request<T>(method, path, spec): Promise<ApiResponse<T>>` — never throws on
  non-2xx
- `ApiResponse<T>` — `{ status, statusText, headers, data, raw, durationMs }`
- `RequestOptions` — `token` (`null` omits the `Authorization` header entirely),
  `authHeader` (replaces the whole header value), `rawBody` (sent verbatim, for
  malformed-JSON cases), `headers`
- `ApiEndpoint` — protected `sendGet` / `sendPost` / `sendDelete`, deliberately NOT named
  `get` / `post` / `delete`, because `UserApi` exposes a public `get()` and `LabelsApi` a
  public `delete()`, and a protected base member of the same name is an illegal override
- Matchers `toHaveStatus(code)` on the whole `ApiResponse`, and `toMatchApiSchema(name)`
  on `response.data`
- `src/support/apis.ts` — shared `httpClient` plus `userApi`, `projectsApi`,
  `sectionsApi`, `tasksApi`, `commentsApi`, `labelsApi`
- `TestRunState { runId, projectId, projectName, startedAt }`, `saveTestRun`,
  `loadTestRun`
- `TestContext` — `projectId`, `runId`, `set/get/require`
- `uniqueName(prefix)`, `uniqueLabelName()`, `LABEL_PREFIX`, `NON_EXISTENT_ID`,
  `MALFORMED_ID`

## Rulings carried over from earlier sessions

1. **Task 7's loader spec must not assert an exact suite count.** Task 10 adds a second
   file for the same operation and would break it. Assert the `required` suite is present
   and correctly parsed instead.
2. **The path-parameter key in every test-case JSON file is `id`.** That is what
   `resolved.pathParams.id ?? <fixtureId>` reads in every resource test file. Each
   resource task must show at least one passing `ID_NONEXISTENT` case as evidence,
   because a wrong key silently falls back to the fixture ID and asserts against the
   wrong resource.
3. **Task 1 verified the `.gitignore` entries instead of appending them** — `.env`,
   `.tmp/` and `reports/` were already covered.
4. **The worktree was relocated** out of `.claude/worktrees/` — see gotcha 1.
5. **Task 3's missing `authHeader` test was fixed, not accepted.**
6. **Task 3's retryable status set was widened** from `{429,500,502,503,504}` to
   `status === 429 || status >= 500`, matching the spec's stated "429 and 5xx" contract.

## Deferred minor findings

Hand this list to the final whole-branch review to triage before merge.

- `jest.config.ts`: the two reporter lines exceed `.prettierrc`'s `printWidth: 110`.
- `src/support/env.ts`: `dotenv.config()` runs as a module-load side effect.
- `package.json`: leftover `npm init` boilerplate (`"main": "index.js"`,
  `"directories": {"doc": "docs"}`) pointing at a non-existent file; also still declares
  `docs:generate` / `docs:check` / `probe` scripts whose files do not exist yet.
- `src/core/SchemaValidator.ts`: `validateFormats: true` is redundant once `ajv-formats`
  is registered.
- `src/core/SchemaValidator.ts`: a schema name present in the spec that fails
  `ajv.compile()` propagates Ajv's raw error without naming the schema.
- `src/core/HttpClient.spec.ts`: the retry tests run with `retryDelayMs: 0`, so the
  `Retry-After` header path and the exponential-backoff fallback are numerically
  indistinguishable.
- `src/core/HttpClient.ts`: two nested ternaries on one line for body selection.
- `src/core/HttpClient.ts`: the `log()` / `logFile` path has no test coverage.
- `src/core/HttpClient.spec.ts`: no test exercises `options.token` set to a specific
  non-null override value.
- `src/support/globalSetup.ts`: `isStale()` reconstructs an ISO timestamp from the
  project name with offset-based hyphen replacement. It is guarded (an unparsable name is
  left alone) but it is fragile; a stored `startedAt` would be cleaner.
