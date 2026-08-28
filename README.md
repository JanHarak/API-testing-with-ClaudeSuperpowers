# Todoist API test automation

Jest + TypeScript test suite for the [Todoist REST API v1](https://developer.todoist.com/openapi.json),
built around endpoint objects (the Page Object pattern applied to an HTTP API) and
validated against the vendored OpenAPI schemas.

**Current state: smoke coverage.** Every one of the 26 in-scope endpoints is exercised
once and asserted for status and response schema. The full required / optional /
negative matrix is designed and planned but not yet built — see [Scope](#scope).

## Quick start

```bash
npm ci
cp .env.example .env      # then paste a real personal API token
npm test
```

Get a token from Todoist: Settings → Integrations → Developer → API token.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Smoke suite against the live API (`tests/**/*.test.ts`) |
| `npm run test:unit` | Offline unit tests of the framework (`src/**/*.spec.ts`) |
| `npm run lint` | ESLint over the whole repository |
| `npm run format` | Prettier write |
| `npm run spec:update` | Re-vendor `data/openapi/todoist-openapi.json` |

Reports land in `reports/` — `junit.xml` and a browsable `html/index.html`.

## How it fits together

```
src/core/       HttpClient (retry, auth escape hatches), ApiEndpoint base,
                SchemaValidator over the vendored OpenAPI spec
src/endpoints/  UserApi, ProjectsApi, SectionsApi, TasksApi, CommentsApi, LabelsApi
src/support/    env loader, shared API instances, run isolation, Jest matchers
tests/smoke/    one lifecycle file per resource
```

`HttpClient` never throws on a non-2xx: it returns an `ApiResponse` so tests can assert
on error responses. `RequestOptions` deliberately exposes escape hatches — `token: null`
omits the `Authorization` header, `authHeader` replaces it wholesale, and `rawBody`
sends a payload verbatim — so malformed requests can be constructed on purpose.

Two custom matchers keep the assertions readable:

```ts
expect(response).toHaveStatus(200);
expect(response.data).toMatchApiSchema('ItemSyncView');
```

## Test data isolation

The suite runs against a **real Todoist account**, so isolation is not optional.

- `globalSetup` creates one sandbox project, `QA-Automation-<timestamp>`, and records it
  in `.tmp/test-run.json`. Every test writes inside that project — never the Inbox, never
  a pre-existing project.
- `globalTeardown` deletes the project, which cascades to its sections, tasks and
  comments. Labels are account-wide, so they are swept separately by their `qa-auto-`
  prefix.
- `globalSetup` also removes sandbox projects abandoned by runs older than two hours. A
  free Todoist account caps active projects, so a crashed run would otherwise eventually
  block the next one.
- Jest runs with `maxWorkers: 1`. Todoist rate limits per user, and parallel workers
  would race over the shared sandbox project.

Nothing without the configured prefix is ever deleted.

## Secrets

`.env` is git-ignored; only `.env.example` is committed. CI reads the token from the
`TODOIST_API_TOKEN` repository secret.

> The token used while designing this suite was pasted into a chat session. Revoke it and
> issue a fresh one before treating this repository as production.

## CI

`.github/workflows/api-tests.yml` runs the suite daily at **07:00 Europe/Prague**, plus
on manual dispatch and on push to `main`.

GitHub Actions cron is UTC-only with no DST handling, so two crons are registered
(`05:00` and `06:00` UTC) and a guard job checks the actual Prague hour, letting exactly
one through per day all year.

A `concurrency` group serialises runs: one account, one suite at a time.

## Scope

In scope — 26 endpoints across six resources:

| Resource | Endpoints | Response schema |
| --- | --- | --- |
| User | `GET /user` | `UserJSON` |
| Projects | create, list, get, update, delete | `AnyProjectSyncViewResponse` |
| Sections | create, list, get, update, delete | `SectionSyncView` |
| Tasks | create, list, get, update, delete | `ItemSyncView` |
| Comments | create, list, get, update, delete | `NoteSyncView` |
| Labels | create, list, get, update, delete | `LabelRestView` |

Todoist uses `POST` for updates, not `PUT` or `PATCH`. Collection endpoints return
`PaginatedList_<View>_`.

Out of scope: the test account is free (`is_premium: false`), so workspaces, payments,
usage billing, backups, templates, reminders, activities, uploads and filters are not
covered.

Not yet built: the data-driven test-case layer (`data/testcases/`), its loader, the
negative-behaviour probe, the per-test-case documentation generator, and the ~300-case
required/optional/negative matrix. The design for all of it lives in
`docs/superpowers/specs/` and `docs/superpowers/plans/`.
