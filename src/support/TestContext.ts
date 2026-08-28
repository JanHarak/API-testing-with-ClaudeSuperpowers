import { loadTestRun, type TestRunState } from './testRun';

/**
 * Per-suite handle on the data the run owns: the sandbox project every test writes
 * into, plus any fixture IDs a suite creates in `beforeAll` and later steps need.
 */
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
      throw new Error(`Fixture "${key}" is not available. Create it in beforeAll first.`);
    }

    return value;
  }
}
