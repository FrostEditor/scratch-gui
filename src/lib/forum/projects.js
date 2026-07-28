/* eslint-disable */
import client from './client.js';
import {FORUM_ORIGIN} from './config.js';

// 作品广场接口封装（与论坛前端 he.* 一致）。
// category 可选：game / animation / story / music / art / tutorial / other

export function listProjects (params = {}) {
    return client.get('/projects', {params}).then((r) => r.data);
}

export function getProject (id) {
    return client.get(`/projects/${id}`).then((r) => r.data);
}

// 发布作品。body: { title, summary, category, fileResourceId, coverResourceId? }
export function createProject (body) {
    return client.post('/projects', body).then((r) => r.data);
}

// 更新作品。body 同 createProject（字段可部分）。
export function updateProject (id, body) {
    return client.patch(`/projects/${id}`, body).then((r) => r.data);
}

export function deleteProject (id) {
    return client.delete(`/projects/${id}`).then((r) => r.data);
}

export function myProjects () {
    return client.get('/projects/my').then((r) => r.data);
}

// 点赞 / 取消点赞。POST /projects/:id/like
export function toggleLike (id) {
    return client.post(`/projects/${id}/like`).then((r) => r.data);
}

// 下载作品的 sb3 文件，返回 ArrayBuffer（供 vm.loadProject 使用）。
// 列表接口（GET /projects）返回的项目不含 sb3Url，需先 GET /projects/:id 获取详情。
// sb3Url 形如 /uploads/xxx.sb3，论坛未对 /uploads 开放 CORS，
// 本地通过 /forum-files 同源代理下载（见 config.js FORUM_ORIGIN）。
export async function downloadProjectSb3 (project) {
    const proj = project.sb3Url ? project : await getProject(project.id);
    if (!proj.sb3Url) throw new Error('该作品没有可下载的文件');
    const url = `${FORUM_ORIGIN}${proj.sb3Url}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载作品文件失败 (HTTP ${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    return {arrayBuffer, project: proj};
}
