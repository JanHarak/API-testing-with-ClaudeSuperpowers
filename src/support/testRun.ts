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
