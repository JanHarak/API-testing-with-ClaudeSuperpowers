import { tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { uniqueName } from '../../src/support/TestDataFactory';

/**
 * Smoke coverage for the five task operations.
 *
 * Every task is created inside the run's sandbox project, never in the Inbox, so a
 * failed run cannot leave anything in the account's real data.
 */
describe('Tasks', () => {
  const context = new TestContext();
  const content = uniqueName('qa-task');
  let taskId: string;

  it('POST /api/v1/tasks creates a task in the run project', async () => {
    const response = await tasksApi.create<{ id: string; content: string; project_id: string }>({
      content,
      project_id: context.projectId,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('ItemSyncView');
    expect(response.data.content).toBe(content);
    expect(response.data.project_id).toBe(context.projectId);

    taskId = response.data.id;
  });

  it('GET /api/v1/tasks lists the tasks of the project', async () => {
    const response = await tasksApi.list<{ results: { id: string }[] }>({
      project_id: context.projectId,
      limit: 200,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('PaginatedList_ItemSyncView_');
    expect(response.data.results.map((task) => task.id)).toContain(taskId);
  });

  it('GET /api/v1/tasks/{id} reads the task back', async () => {
    const response = await tasksApi.getById<{ id: string; content: string }>(taskId);

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('ItemSyncView');
    expect(response.data.id).toBe(taskId);
    expect(response.data.content).toBe(content);
  });

  it('POST /api/v1/tasks/{id} updates the task', async () => {
    const updated = `${content}-updated`;
    const response = await tasksApi.update<{ content: string; priority: number }>(taskId, {
      content: updated,
      priority: 3,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('ItemSyncView');
    expect(response.data.content).toBe(updated);
    expect(response.data.priority).toBe(3);
  });

  it('DELETE /api/v1/tasks/{id} removes the task', async () => {
    const response = await tasksApi.delete(taskId);

    expect(response).toHaveStatus(204);

    const remaining = await tasksApi.list<{ results: { id: string }[] }>({
      project_id: context.projectId,
      limit: 200,
    });
    expect(remaining.data.results.map((task) => task.id)).not.toContain(taskId);
  });
});
