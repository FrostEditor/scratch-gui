// preload.js
// 在渲染进程中运行，用于桥接主进程和渲染进程

const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
    // 监听主进程消息
    onProjectNew: (callback) => ipcRenderer.on('project-new', callback),
    onProjectLoad: (callback) => ipcRenderer.on('project-load', callback),
    onProjectSaveRequest: (callback) => ipcRenderer.on('project-save-request', callback),
    onExtensionLoad: (callback) => ipcRenderer.on('extension-load', callback),
    
    // 发送消息给主进程
    sendProjectSaveData: (data) => ipcRenderer.send('project-save-data', data),
    
    // 移除监听器
    removeProjectNewListener: () => ipcRenderer.removeAllListeners('project-new'),
    removeProjectLoadListener: () => ipcRenderer.removeAllListeners('project-load'),
    removeProjectSaveRequestListener: () => ipcRenderer.removeAllListeners('project-save-request'),
    removeExtensionLoadListener: () => ipcRenderer.removeAllListeners('extension-load')
});
