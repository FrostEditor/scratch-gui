/* eslint-disable */
// 记录「当前编辑器会话所关联的论坛作品」。
// 只有当用户把当前作品发布到社区（或从小作品打开后编辑）后才会被设置，
// 用于菜单栏判断是否显示「更新作品」以及发布时应当 PATCH 而非新建。
const SET_CURRENT_PROJECT = 'forumCurrentProject/SET_CURRENT_PROJECT';
const CLEAR_CURRENT_PROJECT = 'forumCurrentProject/CLEAR_CURRENT_PROJECT';

export const forumCurrentProjectInitialState = null;

export default function reducer (state = forumCurrentProjectInitialState, action = {}) {
    switch (action.type) {
    case SET_CURRENT_PROJECT:
        return action.project;
    case CLEAR_CURRENT_PROJECT:
        return null;
    default:
        return state;
    }
}

// project: { id, title, summary, category, ownerId }
export function setCurrentProject (project) {
    return {type: SET_CURRENT_PROJECT, project};
}

export function clearCurrentProject () {
    return {type: CLEAR_CURRENT_PROJECT};
}
