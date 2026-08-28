import { labelsApi, projectsApi } from './apis';
import { LABEL_PREFIX } from './TestDataFactory';
import { loadTestRun } from './testRun';

interface Named {
  id: string;
  name: string;
  inbox_project?: boolean;
}

/**
 * Deletes everything the run created.
 *
 * Runs even when tests failed, and never throws: a teardown error must not mask the
 * test results. Deleting the sandbox project cascades to its sections, tasks and
 * comments. Labels are account-wide rather than project-scoped, so they are swept
 * separately by their own prefix.
 */
export default async function globalTeardown(): Promise<void> {
  const failures: string[] = [];

  await deleteRunProject(failures);
  await sweepLabels(failures);

  if (failures.length > 0) {
    console.warn(`\nTeardown could not clean up:\n  ${failures.join('\n  ')}\n`);
  }
}

async function deleteRunProject(failures: string[]): Promise<void> {
  let projectId: string;
  let projectName: string;

  try {
    const run = loadTestRun();
    projectId = run.projectId;
    projectName = run.projectName;
  } catch {
    // globalSetup never got far enough to create a project; nothing to remove.
    return;
  }

  try {
    const response = await projectsApi.delete(projectId);

    // 404 means it is already gone, which is a success as far as cleanup is concerned.
    if (response.status !== 204 && response.status !== 200 && response.status !== 404) {
      failures.push(`project ${projectName} (${projectId}) -> HTTP ${response.status}`);
    }
  } catch (cause) {
    failures.push(`project ${projectName} (${projectId}) -> ${(cause as Error).message}`);
  }
}

async function sweepLabels(failures: string[]): Promise<void> {
  try {
    const response = await labelsApi.list<{ results: Named[] }>({ limit: 200 });

    if (response.status !== 200) {
      failures.push(`could not list labels -> HTTP ${response.status}`);
      return;
    }

    for (const label of response.data?.results ?? []) {
      if (!label.name.startsWith(LABEL_PREFIX)) {
        continue;
      }

      const deleted = await labelsApi.delete(label.id);
      if (deleted.status !== 204 && deleted.status !== 200 && deleted.status !== 404) {
        failures.push(`label ${label.name} (${label.id}) -> HTTP ${deleted.status}`);
      }
    }
  } catch (cause) {
    failures.push(`label sweep -> ${(cause as Error).message}`);
  }
}
