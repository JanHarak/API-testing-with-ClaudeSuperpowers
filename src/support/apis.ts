import { HttpClient } from '../core/HttpClient';
import { CommentsApi } from '../endpoints/CommentsApi';
import { LabelsApi } from '../endpoints/LabelsApi';
import { ProjectsApi } from '../endpoints/ProjectsApi';
import { SectionsApi } from '../endpoints/SectionsApi';
import { TasksApi } from '../endpoints/TasksApi';
import { UserApi } from '../endpoints/UserApi';
import { loadEnv } from './env';

const env = loadEnv();

/**
 * One shared client for the whole run. Jest is configured with `maxWorkers: 1`, so a
 * single instance keeps every request on one connection pool and one retry budget,
 * which matters because Todoist rate limits per user.
 */
export const httpClient = new HttpClient({
  baseUrl: env.baseUrl,
  token: env.token,
  logFile: env.httpLog ? 'reports/http.log' : undefined,
});

export const userApi = new UserApi(httpClient);
export const projectsApi = new ProjectsApi(httpClient);
export const sectionsApi = new SectionsApi(httpClient);
export const tasksApi = new TasksApi(httpClient);
export const commentsApi = new CommentsApi(httpClient);
export const labelsApi = new LabelsApi(httpClient);
