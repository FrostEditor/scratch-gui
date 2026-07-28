/* eslint-disable */
import client from './client.js';

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
