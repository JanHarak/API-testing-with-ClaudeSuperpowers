import { isStale, type ProjectSummary } from './globalSetup';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function project(overrides: Partial<ProjectSummary>): ProjectSummary {
  return { id: '1', name: 'QA-Automation-x', ...overrides };
}

describe('isStale', () => {
  it('treats a project older than the two-hour window as stale', () => {
    const createdAt = new Date(Date.now() - THREE_HOURS_MS).toISOString();

    expect(isStale(project({ created_at: createdAt }))).toBe(true);
  });

  it('leaves a project created moments ago alone', () => {
    expect(isStale(project({ created_at: new Date().toISOString() }))).toBe(false);
  });

  it('leaves a project alone when created_at is missing', () => {
    expect(isStale(project({}))).toBe(false);
    expect(isStale(project({ created_at: null }))).toBe(false);
  });

  it('leaves a project alone when created_at is unparsable', () => {
    expect(isStale(project({ created_at: 'not-a-date' }))).toBe(false);
  });
});
