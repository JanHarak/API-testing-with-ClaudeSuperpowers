import { projectsApi } from '../../src/support/apis';
import { uniqueName } from '../../src/support/TestDataFactory';
import { TestContext } from '../../src/support/TestContext';

/**
 * Smoke coverage for the five project operations.
 *
 * The operations are walked as one lifecycle rather than as five independent tests,
 * because create is the only way to obtain an ID the rest can address. Jest runs tests
 * in declaration order within a describe, and the suite is configured with
 * `maxWorkers: 1`, so the ordering holds.
 *
 * The project created here is deleted by the last step. A free Todoist account caps the
 * number of active projects, so a smoke suite must not leave spares behind.
 */
describe('Projects', () => {
  const context = new TestContext();
  const projectName = uniqueName(`${context.run.projectName}-child`);
  let projectId: string;

  it('POST /api/v1/projects creates a project', async () => {
    const response = await projectsApi.create<{ id: string; name: string }>({ name: projectName });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('AnyProjectSyncViewResponse');
    expect(response.data.name).toBe(projectName);

    projectId = response.data.id;
  });

  it('GET /api/v1/projects lists projects including the new one', async () => {
    const response = await projectsApi.list<{ results: { id: string }[] }>({ limit: 200 });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('PaginatedList_AnyProjectSyncViewResponse_');
    expect(response.data.results.map((project) => project.id)).toContain(projectId);
  });

  it('GET /api/v1/projects/{id} reads the project back', async () => {
    const response = await projectsApi.getById<{ id: string; name: string }>(projectId);

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('AnyProjectSyncViewResponse');
    expect(response.data.id).toBe(projectId);
    expect(response.data.name).toBe(projectName);
  });

  it('POST /api/v1/projects/{id} updates the project', async () => {
    const renamed = `${projectName}-renamed`;
    const response = await projectsApi.update<{ name: string }>(projectId, { name: renamed });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('AnyProjectSyncViewResponse');
    expect(response.data.name).toBe(renamed);
  });

  it('DELETE /api/v1/projects/{id} removes the project', async () => {
    const response = await projectsApi.delete(projectId);

    expect(response).toHaveStatus(204);

    // The API soft-deletes: the item stays readable with is_deleted set, but drops out
    // of the collection. The list is therefore the reliable assertion.
    const remaining = await projectsApi.list<{ results: { id: string }[] }>({ limit: 200 });
    expect(remaining.data.results.map((project) => project.id)).not.toContain(projectId);
  });
});
