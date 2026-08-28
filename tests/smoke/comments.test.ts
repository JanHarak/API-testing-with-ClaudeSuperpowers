import { commentsApi, tasksApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { uniqueName } from '../../src/support/TestDataFactory';

/**
 * Smoke coverage for the five comment operations.
 *
 * A comment needs something to hang off, so the suite creates its own task in the run's
 * sandbox project first. `GET /comments` requires a `task_id` or `project_id` filter -
 * an unfiltered call is rejected - so the list step passes the task ID.
 */
describe('Comments', () => {
  const context = new TestContext();
  const content = uniqueName('qa-comment');
  let taskId: string;
  let commentId: string;

  beforeAll(async () => {
    const task = await tasksApi.create<{ id: string }>({
      content: uniqueName('qa-comment-host'),
      project_id: context.projectId,
    });

    if (task.status !== 200) {
      throw new Error(`Could not create the host task for the comment suite: ${task.raw}`);
    }

    taskId = task.data.id;
  });

  it('POST /api/v1/comments creates a comment on a task', async () => {
    const response = await commentsApi.create<{ id: string; content: string }>({
      content,
      task_id: taskId,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('NoteSyncView');
    expect(response.data.content).toBe(content);

    commentId = response.data.id;
  });

  it('GET /api/v1/comments lists the comments of the task', async () => {
    const response = await commentsApi.list<{ results: { id: string }[] }>({
      task_id: taskId,
      limit: 200,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('PaginatedList_NoteSyncView_');
    expect(response.data.results.map((comment) => comment.id)).toContain(commentId);
  });

  it('GET /api/v1/comments/{id} reads the comment back', async () => {
    const response = await commentsApi.getById<{ id: string; content: string }>(commentId);

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('NoteSyncView');
    expect(response.data.id).toBe(commentId);
    expect(response.data.content).toBe(content);
  });

  it('POST /api/v1/comments/{id} updates the comment', async () => {
    const updated = `${content}-updated`;
    const response = await commentsApi.update<{ content: string }>(commentId, {
      content: updated,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('NoteSyncView');
    expect(response.data.content).toBe(updated);
  });

  it('DELETE /api/v1/comments/{id} removes the comment', async () => {
    const response = await commentsApi.delete(commentId);

    expect(response).toHaveStatus(204);

    const remaining = await commentsApi.list<{ results: { id: string }[] }>({
      task_id: taskId,
      limit: 200,
    });
    expect(remaining.data.results.map((comment) => comment.id)).not.toContain(commentId);
  });
});
