# Handoff — Todoist API test suite

Last updated: 2026-08-28, after Task 4 was committed but before its review passed.

This file is committed on branch `feat/todoist-api-tests` so a fresh agent can
resume without the previous session's context. The live SDD ledger lives at
`.superpowers/sdd/2026-08-28-todoist-api-testing/progress.md`, but
`.superpowers/` is git-ignored and may not survive — everything that matters is
duplicated here.

## Where the work is

- Branch: `feat/todoist-api-tests`, checked out in the repository itself
- `main` holds only the design spec, the implementation plan and `.gitignore`
- Merge back into `main` happens only after the final whole-branch review

The work was originally built in a separate git worktree. That worktree has
been removed and the branch is now checked out directly in the repository, so
the files are visible in the project directory. Nothing was lost in the move;
`git log` is the record.

## The two documents that govern this work

1. Spec (the binding authority): `docs/superpowers/specs/2026-08-28-todoist-api-testing-design.md`
2. Plan (17 tasks, argues from the spec): `docs/superpowers/plans/2026-08-28-todoist-api-testing.md`

The process being followed is the `superpowers:subagent-driven-development`
skill: one fresh implementer subagent per task, a task review after each, a
fix loop for Critical/Important findings, and a broad whole-branch review at
the end.

## Status

| Task | State | Commit |
|---|---|---|
| 1. Scaffolding, env loader, vendored OpenAPI spec | complete, review clean | `9ee8444` |
| 2. SchemaValidator over the OpenAPI spec | complete, review clean | `f79ad34` |
| 3. HttpClient | complete, review clean after 1 fix round | `282b5c4`, `7415399` |
| 4. ApiEndpoint base + Jest matchers | **committed, REVIEW NOT DONE** | `3ed4795` |
| 5–17 | not started | — |

Unit tests currently passing: 20 across four spec files
(`env`, `SchemaValidator`, `HttpClient`, `matchers`).

## Do this first

Task 4's review never completed — the reviewer subagent died on a session
rate limit mid-run, so its verdict is unknown. **Do not start Task 5 until
Task 4 has passed a task review.**

To resume:

```bash
# 1. Regenerate the briefs if .superpowers/ is gone
bash <superpowers>/skills/subagent-driven-development/scripts/task-brief \
  docs/superpowers/plans/2026-08-28-todoist-api-testing.md 4

# 2. Build the review package for Task 4
bash <superpowers>/skills/subagent-driven-development/scripts/review-package \
  docs/superpowers/plans/2026-08-28-todoist-api-testing.md 7415399 3ed4795

# 3. Dispatch a task reviewer using
#    <superpowers>/skills/subagent-driven-development/task-reviewer-prompt.md
```

Two things to point that reviewer at, because the tests may not distinguish
them: whether both matchers' `message` functions read correctly in the
NEGATED direction (`expect(...).not.toHaveStatus(...)`), and what
`toMatchApiSchema` does when `schemaValidator.validate` THROWS on an unknown
schema name rather than returning `{ valid: false }` — roughly 300 later test
cases pass schema names in from JSON data files, where a typo is plausible.

## Environment gotchas that cost time already

1. **Never place this checkout under a dot-prefixed directory.** Jest 29 on
   Windows corrupts its glob-based `testMatch` when an ancestor directory
   starts with a dot: the run reports `0 matches` and every test silently
   disappears. The original worktree was created under `.claude/worktrees/`
   and had to be moved for exactly this reason. CI on Linux is unaffected.
   This matters again if anyone creates a worktree for this branch later.
2. **Do not run `npm test` until Task 6 is done.** It is the integration
   config and references `src/support/globalSetup.ts` and `globalTeardown.ts`,
   which Task 6 creates. Until then use `npm run test:unit`, or
   `npx jest --config jest.unit.config.ts <path>` for a single file.
3. `.env` is git-ignored and therefore absent from a fresh checkout. Recreate
   it from `.env.example` with a real Todoist personal API token before any
   task from 6 onwards, which start calling the live API.
4. The account under test is free (`is_premium: false`). Premium endpoints are
   out of scope — see spec chapter 2.

## Rulings made so far

Each was a decision taken on the user's behalf. Revisit any that look wrong.

1. **Task 7's loader spec must not assert an exact suite count.** Task 7 as
   written asserts `loadSuites('user','get')` returns exactly one suite, but
   Task 10 adds a second file for the same operation and would break it.
   Assert the `required` suite is present and correctly parsed instead.
   Cost if wrong: a slightly weaker loader test.
2. **The path-parameter key in every test-case JSON file is `id`.** That is
   what `resolved.pathParams.id ?? <fixtureId>` reads in every resource test
   file. Each resource task must show at least one passing `ID_NONEXISTENT`
   case as evidence, because a wrong key silently falls back to the fixture ID
   and asserts against the wrong resource.
3. **Task 1 verified the `.gitignore` entries instead of appending them**, as
   `.env`, `.tmp/` and `reports/` were already covered.
4. **The worktree was relocated** out of `.claude/worktrees/` — see gotcha 1.
5. **Task 3's missing `authHeader` test was fixed, not accepted.** The plan's
   test list omitted it, but the spec requires the client to send deliberately
   malformed requests and the negative matrix has an `AUTH_MALFORMED` row for
   every endpoint.
6. **Task 3's retryable status set was widened** from
   `{429,500,502,503,504}` to `status === 429 || status >= 500`, matching the
   spec's stated "429 and 5xx" contract. Cost if wrong: at most three wasted
   retries on a permanent 5xx, bounded by the same retry budget.

## Deferred minor findings

Not fixed; hand this list to the final whole-branch review so it can triage
which must be fixed before merge.

- `jest.config.ts`: the two reporter lines exceed `.prettierrc`'s
  `printWidth: 110`. The text is plan-mandated verbatim, but `npm run format`
  will reformat that file later. Warn whichever task next edits it.
- `src/support/env.ts`: `dotenv.config()` runs as a module-load side effect.
- `package.json`: leftover `npm init` boilerplate (`"main": "index.js"`,
  `"directories": {"doc": "docs"}`) pointing at a non-existent file.
- `src/core/SchemaValidator.ts`: `validateFormats: true` is redundant once
  `ajv-formats` is registered.
- `src/core/SchemaValidator.ts`: a schema name present in the spec that fails
  `ajv.compile()` propagates Ajv's raw error without naming the schema.
- `src/core/HttpClient.spec.ts`: the retry tests run with `retryDelayMs: 0`,
  so the `Retry-After` header path and the exponential-backoff fallback are
  numerically indistinguishable; a bug in the header-to-ms conversion would
  not be caught.
- `src/core/HttpClient.ts`: two nested ternaries on one line for body
  selection.
- `src/core/HttpClient.ts`: the `log()` / `logFile` path has no test coverage.
- `src/core/HttpClient.spec.ts`: no test exercises `options.token` set to a
  specific non-null override value.

## Interfaces later tasks depend on

Built and reviewed:

- `loadEnv(): EnvConfig` — `{ token, baseUrl, testProjectPrefix, httpLog }`
- `schemaValidator.validate(schemaName, data): { valid, errors }` — throws on
  an unknown schema name
- `HttpClient.request<T>(method, path, spec): Promise<ApiResponse<T>>` — never
  throws on non-2xx
- `ApiResponse<T>` — `{ status, statusText, headers, data, raw, durationMs }`
- `RequestOptions` — `token` (`null` omits the `Authorization` header
  entirely), `authHeader` (replaces the whole header value), `rawBody` (sent
  verbatim, for malformed-JSON cases), `headers`
- `ApiEndpoint` — protected `sendGet` / `sendPost` / `sendDelete`, deliberately
  NOT named `get` / `post` / `delete`, because Task 5's `UserApi` exposes a
  public `get()` and `LabelsApi` a public `delete()` and a protected base
  member of the same name is an illegal override
- Matchers `toHaveStatus(code)` on the whole `ApiResponse`, and
  `toMatchApiSchema(name)` on `response.data`

## Task 8 is a prerequisite for Tasks 10–15

`scripts/probe-negatives.ts` records the API's real behaviour into
`docs/api-behaviour.md`. Every `expected.status` in the negative test data
must be copied from that file. Do not guess status codes, and do not take them
from the OpenAPI spec — its error responses carry no schema.
