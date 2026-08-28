import { loadEnv } from './env';
import { projectsApi } from './apis';
import { saveTestRun, type TestRunState } from './testRun';

/** Projects left by a run older than this are swept before the new run starts. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export interface ProjectSummary {
  id: string;
  name: string;
  inbox_project?: boolean;
  created_at?: string | null;
}

/**
 * Creates the sandbox project the whole run writes into.
 *
 * The suite runs against a real Todoist account, so nothing is ever created in the
 * Inbox or in a pre-existing project. Every resource a test makes lives inside
 * `QA-Automation-<timestamp>`, and deleting that project in teardown cascades to its
 * sections, tasks and comments.
 */
export default async function globalSetup(): Promise<void> {
  const env = loadEnv();

  await sweepStaleProjects(env.testProjectPrefix);

  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[:.]/g, '-');
  const projectName = `${env.testProjectPrefix}-${runId}`;

  const response = await projectsApi.create<{ id: string }>({ name: projectName });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Todoist rejected the token with HTTP ${response.status} while creating the test ` +
        `project. Check TODOIST_API_TOKEN in .env, or the GitHub Actions secret.\n${response.raw}`,
    );
  }

  if (response.status !== 200 || !response.data?.id) {
    throw new Error(
      `Could not create the test project "${projectName}" (HTTP ${response.status}).\n` +
        `${response.raw}\n` +
        'A free Todoist account caps the number of active projects; if the cap is the ' +
        'cause, delete leftover QA-Automation projects in the Todoist UI and retry.',
    );
  }

  const state: TestRunState = {
    runId,
    projectId: response.data.id,
    projectName,
    startedAt,
  };

  saveTestRun(state);

  console.log(
    [
      '',
      'Todoist API smoke run',
      `  base URL     ${env.baseUrl}`,
      `  project      ${projectName} (${state.projectId})`,
      '',
      `  Only resources named with the "${env.testProjectPrefix}" prefix are ever deleted.`,
      '',
    ].join('\n'),
  );
}

/**
 * Removes sandbox projects abandoned by earlier runs.
 *
 * A crashed run cannot delete its own project, and a free account allows only a handful
 * of active projects, so without this the suite eventually fails to start. Only projects
 * carrying the configured prefix AND older than `STALE_AFTER_MS` are touched, which
 * keeps this from deleting a project a concurrent run is still using.
 */
async function sweepStaleProjects(prefix: string): Promise<void> {
  const response = await projectsApi.list<{ results: ProjectSummary[] }>({ limit: 200 });

  if (response.status !== 200) {
    return;
  }

  for (const project of response.data?.results ?? []) {
    if (project.inbox_project || !project.name.startsWith(`${prefix}-`)) {
      continue;
    }

    if (!isStale(project)) {
      continue;
    }

    const deleted = await projectsApi.delete(project.id);
    console.log(`  swept stale test project ${project.name} (HTTP ${deleted.status})`);
  }
}

/**
 * Ages a project by the `created_at` the API reports.
 *
 * The run ID embedded in the project name is a timestamp with its separators flattened
 * to hyphens, and reconstructing an ISO string from it is fiddly and easy to get wrong.
 * `created_at` is already an ISO timestamp, so it is used instead. A project whose
 * timestamp is missing or unparsable is left alone rather than guessed at.
 */
export function isStale(project: ProjectSummary): boolean {
  if (!project.created_at) {
    return false;
  }

  const createdAt = Date.parse(project.created_at);
  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt > STALE_AFTER_MS;
}
