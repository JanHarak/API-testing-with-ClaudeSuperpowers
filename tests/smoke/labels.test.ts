import { labelsApi } from '../../src/support/apis';
import { uniqueLabelName } from '../../src/support/TestDataFactory';

/**
 * Smoke coverage for the five label operations.
 *
 * Labels are account-wide rather than project-scoped, so they are not cleaned up by
 * deleting the sandbox project. The last step deletes this label explicitly, and
 * globalTeardown sweeps anything left over by its `qa-auto-` prefix.
 *
 * Label IDs are numeric strings, unlike the base32 IDs the other resources use.
 */
describe('Labels', () => {
  const labelName = uniqueLabelName();
  let labelId: string;

  it('POST /api/v1/labels creates a label', async () => {
    const response = await labelsApi.create<{ id: string; name: string }>({ name: labelName });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('LabelRestView');
    expect(response.data.name).toBe(labelName);

    labelId = response.data.id;
  });

  it('GET /api/v1/labels lists labels including the new one', async () => {
    const response = await labelsApi.list<{ results: { id: string }[] }>({ limit: 200 });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('PaginatedList_LabelRestView_');
    expect(response.data.results.map((label) => label.id)).toContain(labelId);
  });

  it('GET /api/v1/labels/{id} reads the label back', async () => {
    const response = await labelsApi.getById<{ id: string; name: string }>(labelId);

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('LabelRestView');
    expect(response.data.id).toBe(labelId);
    expect(response.data.name).toBe(labelName);
  });

  it('POST /api/v1/labels/{id} updates the label', async () => {
    const renamed = `${labelName}-renamed`;
    const response = await labelsApi.update<{ name: string }>(labelId, { name: renamed });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('LabelRestView');
    expect(response.data.name).toBe(renamed);
  });

  it('DELETE /api/v1/labels/{id} removes the label', async () => {
    const response = await labelsApi.delete(labelId);

    expect(response).toHaveStatus(204);

    const remaining = await labelsApi.list<{ results: { id: string }[] }>({ limit: 200 });
    expect(remaining.data.results.map((label) => label.id)).not.toContain(labelId);
  });
});
