import { apiFetch } from '../api';
import type { Asset, ModelInfo, Project, ProjectSummary, ProjectVersion, SystemTemplate, V2Graph, WorkflowRun } from './types';

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.message || `请求失败 (${response.status})`);
  return body as T;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return responseJson(await apiFetch('/api/v2/projects'));
}

export async function getProject(id: string): Promise<Project> {
  return responseJson(await apiFetch(`/api/v2/projects/${id}`));
}

export async function createProject(name = '未命名项目'): Promise<Project> {
  return responseJson(await apiFetch('/api/v2/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, graph: { nodes: [], edges: [] } }),
  }));
}

export async function saveProject(project: Project, graph: V2Graph, viewport: Project['viewport']): Promise<Project> {
  return responseJson(await apiFetch(`/api/v2/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: project.revision,
      name: project.name,
      description: project.description,
      graph,
      viewport,
      settings: project.settings,
      reason: 'auto',
    }),
  }));
}

export type ProjectPatch = {
  upsertNodes: V2Graph['nodes'];
  deleteNodeIds: string[];
  upsertEdges: V2Graph['edges'];
  deleteEdgeIds: string[];
};

export async function patchProject(
  project: Project,
  patch: ProjectPatch,
  viewport: Project['viewport'],
): Promise<Pick<Project, 'id' | 'name' | 'description' | 'revision' | 'updated_at'>> {
  return responseJson(await apiFetch(`/api/v2/projects/${project.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: project.revision,
      name: project.name,
      description: project.description,
      upsert_nodes: patch.upsertNodes,
      delete_node_ids: patch.deleteNodeIds,
      upsert_edges: patch.upsertEdges,
      delete_edge_ids: patch.deleteEdgeIds,
      viewport,
    }),
  }));
}

export async function listTemplates(): Promise<SystemTemplate[]> {
  return responseJson(await apiFetch('/api/v2/templates'));
}

export async function createTemplate(project: Project, graph: V2Graph): Promise<SystemTemplate> {
  return responseJson(await apiFetch('/api/v2/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${project.name} 模板`,
      description: project.description,
      category: '个人模板',
      graph,
    }),
  }));
}

export async function updateTemplate(template: SystemTemplate, graph: V2Graph): Promise<SystemTemplate> {
  return responseJson(await apiFetch(`/api/v2/templates/${template.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: template.name,
      description: template.description,
      category: template.category,
      graph,
    }),
  }));
}

export async function instantiateTemplate(id: string): Promise<Project> {
  return responseJson(await apiFetch(`/api/v2/templates/${id}/instantiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
}

export async function uploadAsset(file: File, projectId?: string, kind = 'image'): Promise<Asset> {
  const body = new FormData();
  body.append('file', file);
  body.append('kind', kind);
  if (projectId) body.append('project_id', projectId);
  return responseJson(await apiFetch('/api/v2/assets', { method: 'POST', body }));
}

export async function listAssets(projectId?: string): Promise<Asset[]> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return responseJson(await apiFetch(`/api/v2/assets${query}`));
}

export async function listModels(type: 'image' | 'chat'): Promise<ModelInfo[]> {
  return responseJson(await apiFetch(`/api/models?type=${type}`));
}

export async function createRun(projectId: string, graph?: V2Graph): Promise<WorkflowRun> {
  return responseJson(await apiFetch('/api/v2/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...(graph ? { graph } : {}) }),
  }));
}

export async function getRun(id: string): Promise<WorkflowRun> {
  return responseJson(await apiFetch(`/api/v2/runs/${id}`));
}

export async function listRuns(projectId?: string): Promise<WorkflowRun[]> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return responseJson(await apiFetch(`/api/v2/runs${query}`));
}

export async function cancelRun(id: string): Promise<void> {
  await responseJson(await apiFetch(`/api/v2/runs/${id}/cancel`, { method: 'POST' }));
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersion[]> {
  return responseJson(await apiFetch(`/api/v2/projects/${projectId}/versions`));
}

export async function createProjectVersion(projectId: string): Promise<ProjectVersion> {
  return responseJson(await apiFetch(`/api/v2/projects/${projectId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: '手动保存' }),
  }));
}

export async function restoreProjectVersion(projectId: string, versionId: number): Promise<Project> {
  return responseJson(await apiFetch(`/api/v2/projects/${projectId}/versions/${versionId}/restore`, {
    method: 'POST',
  }));
}
