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
