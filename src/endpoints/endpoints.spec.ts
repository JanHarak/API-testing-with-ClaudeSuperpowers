import type { HttpClient } from '../core/HttpClient';
import { CommentsApi } from './CommentsApi';
import { LabelsApi } from './LabelsApi';
import { ProjectsApi } from './ProjectsApi';
import { SectionsApi } from './SectionsApi';
import { TasksApi } from './TasksApi';
import { UserApi } from './UserApi';

describe('endpoint classes build the documented paths', () => {
  const request = jest.fn().mockResolvedValue({ status: 200, data: null });
  const client = { request } as unknown as HttpClient;

  beforeEach(() => request.mockClear());

  it.each([
    ['user get', () => new UserApi(client).get(), 'GET', '/api/v1/user'],
    ['tasks create', () => new TasksApi(client).create({ content: 'x' }), 'POST', '/api/v1/tasks'],
    ['tasks list', () => new TasksApi(client).list({ limit: 5 }), 'GET', '/api/v1/tasks'],
    ['tasks getById', () => new TasksApi(client).getById('7'), 'GET', '/api/v1/tasks/7'],
    ['tasks update', () => new TasksApi(client).update('7', { content: 'y' }), 'POST', '/api/v1/tasks/7'],
    ['tasks delete', () => new TasksApi(client).delete('7'), 'DELETE', '/api/v1/tasks/7'],
    ['projects create', () => new ProjectsApi(client).create({ name: 'x' }), 'POST', '/api/v1/projects'],
    ['projects list', () => new ProjectsApi(client).list(), 'GET', '/api/v1/projects'],
    ['projects getById', () => new ProjectsApi(client).getById('7'), 'GET', '/api/v1/projects/7'],
    ['projects update', () => new ProjectsApi(client).update('7', { name: 'y' }), 'POST', '/api/v1/projects/7'],
    ['projects delete', () => new ProjectsApi(client).delete('7'), 'DELETE', '/api/v1/projects/7'],
    ['sections create', () => new SectionsApi(client).create({ name: 'x' }), 'POST', '/api/v1/sections'],
    ['sections list', () => new SectionsApi(client).list(), 'GET', '/api/v1/sections'],
    ['sections getById', () => new SectionsApi(client).getById('7'), 'GET', '/api/v1/sections/7'],
    ['sections update', () => new SectionsApi(client).update('7', { name: 'y' }), 'POST', '/api/v1/sections/7'],
    ['sections delete', () => new SectionsApi(client).delete('7'), 'DELETE', '/api/v1/sections/7'],
    ['comments create', () => new CommentsApi(client).create({ content: 'x' }), 'POST', '/api/v1/comments'],
    ['comments list', () => new CommentsApi(client).list(), 'GET', '/api/v1/comments'],
    ['comments getById', () => new CommentsApi(client).getById('7'), 'GET', '/api/v1/comments/7'],
    ['comments update', () => new CommentsApi(client).update('7', { content: 'y' }), 'POST', '/api/v1/comments/7'],
    ['comments delete', () => new CommentsApi(client).delete('7'), 'DELETE', '/api/v1/comments/7'],
    ['labels create', () => new LabelsApi(client).create({ name: 'x' }), 'POST', '/api/v1/labels'],
    ['labels list', () => new LabelsApi(client).list(), 'GET', '/api/v1/labels'],
    ['labels getById', () => new LabelsApi(client).getById('7'), 'GET', '/api/v1/labels/7'],
    ['labels update', () => new LabelsApi(client).update('7', { name: 'y' }), 'POST', '/api/v1/labels/7'],
    ['labels delete', () => new LabelsApi(client).delete('7'), 'DELETE', '/api/v1/labels/7'],
  ])('%s', async (_name, call, method, path) => {
    await call();
    expect(request).toHaveBeenCalledWith(method, path, expect.anything());
  });

  it('passes the query through on list', async () => {
    await new TasksApi(client).list({ project_id: '9', limit: 10 });

    expect(request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/tasks',
      expect.objectContaining({ query: { project_id: '9', limit: 10 } }),
    );
  });

  it('passes request options through', async () => {
    await new TasksApi(client).getById('7', { token: null });

    expect(request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/tasks/7',
      expect.objectContaining({ options: { token: null } }),
    );
  });

  it('sends the create payload verbatim so invalid payloads reach the API', async () => {
    await new TasksApi(client).create({ content: 12345, bogus: true });

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/tasks',
      expect.objectContaining({ body: { content: 12345, bogus: true } }),
    );
  });
});
