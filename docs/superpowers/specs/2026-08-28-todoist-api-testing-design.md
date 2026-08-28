# Todoist API Test Automation - Design

Datum: 2026-08-28
Stav: schváleno

## 1. Cíl

Automatizovaná regresní sada pro veřejné REST API Todoistu
(`https://api.todoist.com/api/v1`), postavená na Jestu a TypeScriptu.
Sada běží lokálně i v GitHub Actions každý den v 7:00 pražského času a
produkuje HTML a JUnit report.

Zdroj pravdy o rozhraní je oficiální OpenAPI 3.1 spec
(`https://developer.todoist.com/openapi.json`), uložený v repozitáři.

## 2. Rozsah

Testovací účet je free (`is_premium: false`, `business_account_id: null`),
proto jsou mimo rozsah endpointy vyžadující Premium nebo Business:
workspaces, payments, usage_billing, backups, templates, reminders,
activities, uploads, filters.

V rozsahu je 26 endpointů v šesti resources:

| Resource | Endpointy | Response schéma (OpenAPI) |
|---|---|---|
| User | `GET /user` | `UserJSON` |
| Projects | `POST /projects`, `GET /projects`, `GET /projects/{id}`, `POST /projects/{id}`, `DELETE /projects/{id}` | `AnyProjectSyncViewResponse` |
| Sections | `POST /sections`, `GET /sections`, `GET /sections/{id}`, `POST /sections/{id}`, `DELETE /sections/{id}` | `SectionSyncView` |
| Tasks | `POST /tasks`, `GET /tasks`, `GET /tasks/{id}`, `POST /tasks/{id}`, `DELETE /tasks/{id}` | `ItemSyncView` |
| Comments | `POST /comments`, `GET /comments`, `GET /comments/{id}`, `POST /comments/{id}`, `DELETE /comments/{id}` | `NoteSyncView` |
| Labels | `POST /labels`, `GET /labels`, `GET /labels/{id}`, `POST /labels/{id}`, `DELETE /labels/{id}` | `LabelRestView` |

Kolekční GET endpointy vracejí `PaginatedList_<View>_`.

Todoist používá `POST` i pro update, nikoli `PUT` ani `PATCH`.

## 3. Architektura

### 3.1 Vrstvy

```
tests/          testovací soubory (tenké, bez znalosti URL)
  |
data/           JSON test case + uložený OpenAPI spec
  |
src/endpoints/  service objecty (obdoba page objectů), jeden na resource
  |
src/core/       HttpClient, SchemaValidator, ApiEndpoint
```

Test nezná URL ani hlavičky. Zná jen metodu service objectu, vstupní data
z JSON a očekávaný výsledek.

### 3.2 src/core

**`HttpClient.ts`** je tenká obálka nad nativním `fetch`.

- základní URL a `Authorization: Bearer` z konfigurace
- vrací `ApiResponse<T> = { status, statusText, headers, data, raw, durationMs }`
- na non-2xx **nikdy nehází výjimku**; status je předmětem asercí
- retry s exponenciálním backoffem na `429` (respektuje `Retry-After`)
  a na `5xx`, maximálně 3 pokusy
- umí poslat i záměrně vadný požadavek (rozbitý JSON, chybějící token,
  cizí token), což je potřeba pro negativní scénáře
- volitelné logování požadavků a odpovědí do `reports/http.log`

**`SchemaValidator.ts`** používá AJV ve variantě `ajv/dist/2020`, protože
OpenAPI 3.1 je JSON Schema 2020-12. Nastavení `strict: false`,
`allErrors: true`, plus `ajv-formats`. Celý spec se registruje jako jedno
schéma s `$id: 'openapi.json'` a validace se volá přes
`{ $ref: 'openapi.json#/components/schemas/<Name>' }`. Kompilovaná
schémata se cachují podle jména.

Ověřeno prototypem: schémata `ItemSyncView`, `AnyProjectSyncViewResponse`,
`SectionSyncView`, `NoteSyncView`, `LabelRestView`, `UserJSON`
a `PaginatedList_ItemSyncView_` se kompilují bez chyby a reálné odpovědi
z účtu proti nim projdou.

**`ApiEndpoint.ts`** je abstraktní základ. Drží `HttpClient`, skládá cesty
z `basePath` a segmentů a poskytuje zkratky `get`, `post`, `delete`.

### 3.3 src/endpoints

Jedna třída na resource, dědí z `ApiEndpoint`. Veřejné metody odpovídají
operacím rozhraní:

```ts
class TasksApi extends ApiEndpoint {
  create(payload: unknown, options?: RequestOptions): Promise<ApiResponse<Task>>
  list(query?: TaskListQuery, options?: RequestOptions): Promise<ApiResponse<Paginated<Task>>>
  getById(id: string, options?: RequestOptions): Promise<ApiResponse<Task>>
  update(id: string, payload: unknown, options?: RequestOptions): Promise<ApiResponse<Task>>
  delete(id: string, options?: RequestOptions): Promise<ApiResponse<void>>
}
```

`payload` je záměrně `unknown`, aby šly poslat i nevalidní struktury
z negativních test case. `RequestOptions` umožní přepsat token nebo
poslat surové tělo.

Třídy: `UserApi`, `ProjectsApi`, `SectionsApi`, `TasksApi`,
`CommentsApi`, `LabelsApi`.

### 3.4 src/support

- **`env.ts`** načte `.env` přes `dotenv`, zvaliduje přítomnost
  `TODOIST_API_TOKEN` a při chybějícím tokenu selže se srozumitelnou
  hláškou.
- **`TestDataFactory.ts`** generuje unikátní názvy s prefixem `qa-auto-`
  a resolvuje placeholdery v JSON datech.
- **`TestContext.ts`** drží ID kořenového testovacího projektu a registr
  entit vytvořených během běhu; poskytuje `cleanup()`.
- **`matchers.ts`** přidává vlastní Jest matchery `toHaveStatus(code)`
  a `toMatchApiSchema(schemaName)`. Při chybě vypíšou seznam AJV chyb
  s cestou k poli.

## 4. Data-driven vrstva

### 4.1 Umístění a formát

```
data/
  openapi/todoist-openapi.json
  testcases/
    tasks/create.required.json
    tasks/create.optional.json
    tasks/create.negative.json
    tasks/list.required.json
    ...
```

Konvence je `data/testcases/<resource>/<operation>.<kind>.json`,
kde `kind` je `required`, `optional` nebo `negative`.

### 4.2 Struktura souboru

```json
{
  "endpoint": "POST /api/v1/tasks",
  "resource": "tasks",
  "operation": "create",
  "kind": "required",
  "cases": [
    {
      "id": "TC-TASKS-CREATE-REQ-001",
      "title": "Vytvoření úkolu pouze s povinným polem content",
      "description": "Ověřuje, že úkol lze vytvořit s minimálním validním payloadem.",
      "priority": "high",
      "preconditions": ["Existuje testovací projekt"],
      "payload": { "content": "{{uniqueName}}" },
      "expected": {
        "status": 200,
        "schema": "ItemSyncView",
        "bodyContains": { "content": "{{uniqueName}}" }
      }
    }
  ]
}
```

Klíče `payload`, `query`, `pathParams` a `headers` jsou volitelné podle
typu operace. `expected` podporuje `status`, `schema`, `bodyContains`
(částečná shoda) a `errorContains` (podřetězec v chybové odpovědi).

### 4.3 Placeholdery

Resolvují se rekurzivně těsně před odesláním požadavku:

| Placeholder | Význam |
|---|---|
| `{{projectId}}` | ID kořenového testovacího projektu |
| `{{sectionId}}` | ID sekce vytvořené ve fixture |
| `{{taskId}}` | ID úkolu vytvořeného ve fixture |
| `{{commentId}}`, `{{labelId}}` | ID komentáře nebo labelu z fixture |
| `{{uniqueName}}` | `qa-auto-<operace>-<krátké uuid>` |
| `{{uuid}}` | náhodné UUID |
| `{{timestamp}}` | ISO timestamp běhu |
| `{{nonExistentId}}` | syntakticky platné, ale neexistující ID |
| `{{longString:N}}` | řetězec délky N pro testy limitů |

## 5. Testy

Testy jsou v `tests/<resource>/<operation>.test.ts`. Každý soubor načte
příslušné JSON sady a projede je přes `it.each`:

```ts
describe('POST /api/v1/tasks', () => {
  describe.each(loadSuites('tasks', 'create'))('$kind', ({ cases }) => {
    it.each(cases)('[$id] $title', async (tc) => {
      const res = await tasksApi.create(resolve(tc.payload));
      expect(res).toHaveStatus(tc.expected.status);
      if (tc.expected.schema) expect(res.data).toMatchApiSchema(tc.expected.schema);
      if (tc.expected.bodyContains) expect(res.data).toMatchObject(resolve(tc.expected.bodyContains));
    });
  });
});
```

Sady scénářů na endpoint:

- **required**: minimální validní payload, ověření defaultů serveru
- **optional**: každé nepovinné pole zvlášť a poté kombinace
  (`description`, `priority`, `labels`, `due_string`, `due_date`,
  `deadline_date`, `parent_id`, `section_id`, `order`, `assignee_id`)
- **negative**: chybějící povinné pole, prázdná hodnota, špatný typ,
  překročená délka, neplatná hodnota enumu (`priority: 5`), neexistující
  ID (404), nevalidní formát ID, chybějící token (401), nevalidní token
  (401), rozbitý JSON, nevalidní parametry stránkování (`limit: -1`)

### 5.1 Očekávané statusy se neodhadují

Očekávané chování negativních scénářů se **nezapisuje podle domněnky ani
podle specu**. Během implementace se každý negativní případ jednou reálně
zavolá průzkumným skriptem `scripts/probe-negatives.ts` a do JSON se
zapíše skutečné chování API. Pokud se realita rozchází s OpenAPI specem,
poznamená se to v dokumentaci daného test case.

## 6. Izolace testovacích dat

`globalSetup` založí projekt `QA-Automation-<ISO timestamp>` a uloží jeho
ID do `.tmp/test-run.json`. Veškerá data vznikají uvnitř tohoto projektu.

`globalTeardown` projekt smaže; sekce, úkoly a komentáře zmizí kaskádou.
Labely jsou v Todoistu globální pro účet, proto se mažou zvlášť podle
prefixu `qa-auto-`. Teardown běží i po pádu testů a navíc uklidí projekty
a labely se stejným prefixem zbylé po starších bězích.

Jest běží s `maxWorkers: 1`. Todoist má rate limit a paralelní běh by
vytvářel závody nad sdílenými daty.

## 7. Konfigurace a tajemství

`.env` je v `.gitignore`, v repozitáři je jen `.env.example`:

```
TODOIST_API_TOKEN=your_token_here
TODOIST_BASE_URL=https://api.todoist.com
TEST_PROJECT_PREFIX=QA-Automation
HTTP_LOG=false
```

V GitHub Actions se token bere ze secretu `TODOIST_API_TOKEN`.

Token použitý při návrhu prošel otevřeným chatem, proto se doporučuje jej
po zprovoznění projektu revokovat a nahradit novým.

## 8. Dokumentace test case

Každý test case má vlastní markdown soubor:

```
docs/test-cases/
  README.md                          index se statistikou a odkazy
  tasks/TC-TASKS-CREATE-REQ-001.md
  ...
```

Soubory generuje `scripts/generate-test-docs.ts` z JSON dat, takže
dokumentace se nemůže rozejít s testy. Obsah je česky a má tuto osnovu:
ID, endpoint, resource, typ sady, priorita, předpoklady, vstupní data,
kroky, očekávaný výsledek, odkaz na testovací soubor a případné poznámky
k odchylkám od specu.

Příkaz `npm run docs:check` dokumentaci přegeneruje a porovná; při rozdílu
skončí nenulovým návratovým kódem. Tento krok je součástí CI.

## 9. Reporting

- `jest-html-reporters` do `reports/html/`
- `jest-junit` do `reports/junit.xml`
- oba adresáře jsou v `.gitignore`, v CI se ukládají jako artefakt
  s retencí 30 dní a krok běží s `if: always()`

## 10. CI: GitHub Actions

Soubor `.github/workflows/api-tests.yml`:

- spouštění: `schedule` na `0 5 * * *` a `0 6 * * *`, dále
  `workflow_dispatch` a `push` na `main`
- první krok jobu je časová pojistka. U události `schedule` se zjistí
  hodina v zóně `Europe/Prague` a pokud není `07`, job se ukončí jako
  úspěšný bez dalších kroků. Kombinace dvou cronů a pojistky dává přesně
  7:00 pražského času po celý rok včetně přechodu na letní čas.
- Node 20, `npm ci`
- `npm run docs:check`
- `npm test`
- upload artefaktů s `if: always()`

## 11. Technologie

| Oblast | Volba |
|---|---|
| Runtime | Node.js 20 (nativní `fetch`) |
| Jazyk | TypeScript 5, strict |
| Test runner | Jest 29 + ts-jest |
| Validace schémat | ajv 8 (`ajv/dist/2020`) + ajv-formats |
| Konfigurace | dotenv |
| Reporty | jest-html-reporters, jest-junit |
| Lint | ESLint + Prettier |

Kód, názvy testů a commit messages jsou anglicky, dokumentace test case
česky.

## 12. Struktura repozitáře

```
.github/workflows/api-tests.yml
data/
  openapi/todoist-openapi.json
  testcases/<resource>/<operation>.<kind>.json
docs/
  superpowers/specs/
  test-cases/<resource>/TC-*.md
scripts/
  generate-test-docs.ts
  probe-negatives.ts
src/
  core/       HttpClient.ts, ApiEndpoint.ts, SchemaValidator.ts, types.ts
  endpoints/  UserApi.ts, ProjectsApi.ts, SectionsApi.ts, TasksApi.ts,
              CommentsApi.ts, LabelsApi.ts
  support/    env.ts, TestDataFactory.ts, TestContext.ts, matchers.ts,
              globalSetup.ts, globalTeardown.ts, loadTestCases.ts
tests/
  <resource>/<operation>.test.ts
.env.example
jest.config.ts
tsconfig.json
```

## 13. Rozsah prací

26 endpointů, přibližně 12 test case na endpoint, tedy zhruba 300 test
case a stejný počet vygenerovaných dokumentačních souborů.

## 14. Mimo rozsah

- Premium a Business endpointy (viz kapitola 2)
- výkonnostní a zátěžové testování
- testování webového UI Todoistu
- Sync API; projekt cílí výhradně na REST rozhraní v1
