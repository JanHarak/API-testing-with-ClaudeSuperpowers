import { sectionsApi } from '../../src/support/apis';
import { TestContext } from '../../src/support/TestContext';
import { uniqueName } from '../../src/support/TestDataFactory';

/**
 * Smoke coverage for the five section operations.
 *
 * Sections live inside a project, so every call is scoped to the run's sandbox project.
 * The section is deleted by the last step; anything left behind would be removed anyway
 * when globalTeardown deletes the sandbox project.
 */
describe('Sections', () => {
  const context = new TestContext();
  const sectionName = uniqueName('qa-section');
  let sectionId: string;

  it('POST /api/v1/sections creates a section in the run project', async () => {
    const response = await sectionsApi.create<{ id: string; name: string; project_id: string }>({
      name: sectionName,
      project_id: context.projectId,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('SectionSyncView');
    expect(response.data.name).toBe(sectionName);
    expect(response.data.project_id).toBe(context.projectId);

    sectionId = response.data.id;
  });

  it('GET /api/v1/sections lists the sections of the project', async () => {
    const response = await sectionsApi.list<{ results: { id: string }[] }>({
      project_id: context.projectId,
      limit: 200,
    });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('PaginatedList_SectionSyncView_');
    expect(response.data.results.map((section) => section.id)).toContain(sectionId);
  });

  it('GET /api/v1/sections/{id} reads the section back', async () => {
    const response = await sectionsApi.getById<{ id: string; name: string }>(sectionId);

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('SectionSyncView');
    expect(response.data.id).toBe(sectionId);
    expect(response.data.name).toBe(sectionName);
  });

  it('POST /api/v1/sections/{id} updates the section', async () => {
    const renamed = `${sectionName}-renamed`;
    const response = await sectionsApi.update<{ name: string }>(sectionId, { name: renamed });

    expect(response).toHaveStatus(200);
    expect(response.data).toMatchApiSchema('SectionSyncView');
    expect(response.data.name).toBe(renamed);
  });

  it('DELETE /api/v1/sections/{id} removes the section', async () => {
    const response = await sectionsApi.delete(sectionId);

    expect(response).toHaveStatus(204);

    const remaining = await sectionsApi.list<{ results: { id: string }[] }>({
      project_id: context.projectId,
      limit: 200,
    });
    expect(remaining.data.results.map((section) => section.id)).not.toContain(sectionId);
  });
});
