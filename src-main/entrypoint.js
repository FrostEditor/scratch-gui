const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 禁用硬件加速可能会解决一些渲染问题
// app.disableHardwareAcceleration();

let mainWindow;
let currentProjectPath = null; // 当前打开的文件路径

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'FrostEditor',
        icon: path.join(__dirname, '..', 'build', 'images', '512.png'),
        backgroundColor: '#111111', // 深色背景，和主题一致
        show: false, // 先隐藏，等加载完再显示
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false, // 关闭沙箱，方便 preload 脚本
            preload: path.join(__dirname, '../src-preload/preload.js')
        }
    });

    // 加载完成后显示窗口，避免白屏
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 加载构建后的编辑器（直接进入编辑器页面）
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '..', 'build', 'editor.html')}`;
    mainWindow.loadURL(startUrl);

    // 打开开发者工具（开发时用，打包时注释掉）
    // mainWindow.webContents.openDevTools();

    // 所有外链在浏览器中打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 创建菜单
    createMenu();
}

// 创建菜单
function createMenu() {
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '新建',
                    accelerator: 'Ctrl+N',
                    click: () => {
                        createNewProject();
                    }
                },
                {
                    label: '打开...',
                    accelerator: 'Ctrl+O',
                    click: () => {
                        openProject();
                    }
                },
                {
                    label: '保存',
                    accelerator: 'Ctrl+S',
                    click: () => {
                        saveProject();
                    }
                },
                {
                    label: '另存为...',
                    accelerator: 'Ctrl+Shift+S',
                    click: () => {
                        saveProjectAs();
                    }
                },
                { type: 'separator' },
                {
                    label: '从电脑加载扩展...',
                    click: () => {
                        loadExtensionFromFile();
                    }
                },
                { type: 'separator' },
                { role: 'quit', label: '退出' }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                { role: 'selectAll', label: '全选' }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '关于 FrostEditor',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '关于 FrostEditor',
                            message: 'FrostEditor',
                            detail: '基于 Scratch 3.0 的多人协作编辑器\n\n版本: ' + app.getVersion() + '\n\nhttps://github.com/FrostEditor'
                        });
                    }
                },
                {
                    label: '访问官网',
                    click: () => {
                        shell.openExternal('https://github.com/FrostEditor');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 新建项目
function createNewProject() {
    if (!mainWindow) return;
    mainWindow.webContents.send('project-new');
    currentProjectPath = null;
    updateWindowTitle();
}

// 打开项目
function openProject() {
    if (!mainWindow) return;
    
    dialog.showOpenDialog(mainWindow, {
        title: '打开项目',
        filters: [
            { name: 'Scratch 项目', extensions: ['sb3', 'sb2', 'sb'] },
            { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    dialog.showErrorBox('打开失败', '无法读取文件: ' + err.message);
                    return;
                }
                // 发送给渲染进程加载
                mainWindow.webContents.send('project-load', {
                    data: data.buffer, // ArrayBuffer
                    path: filePath
                });
                currentProjectPath = filePath;
                updateWindowTitle();
            });
        }
    }).catch(err => {
        console.error('打开文件对话框出错', err);
    });
}

// 保存项目
function saveProject() {
    if (!mainWindow) return;
    
    if (currentProjectPath) {
        // 已有路径，直接保存
        mainWindow.webContents.send('project-save-request');
    } else {
        // 没有路径，另存为
        saveProjectAs();
    }
}

// 另存为
function saveProjectAs() {
    if (!mainWindow) return;
    
    dialog.showSaveDialog(mainWindow, {
        title: '保存项目',
        defaultPath: '未命名项目.sb3',
        filters: [
            { name: 'Scratch 3 项目', extensions: ['sb3'] }
        ]
    }).then(result => {
        if (!result.canceled && result.filePath) {
            currentProjectPath = result.filePath;
            updateWindowTitle();
            // 请求渲染进程发送项目数据
            mainWindow.webContents.send('project-save-request');
        }
    }).catch(err => {
        console.error('保存文件对话框出错', err);
    });
}

// 从文件加载扩展
function loadExtensionFromFile() {
    if (!mainWindow) return;
    
    dialog.showOpenDialog(mainWindow, {
        title: '加载扩展',
        filters: [
            { name: 'JavaScript 文件', extensions: ['js'] },
            { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            fs.readFile(filePath, 'utf-8', (err, data) => {
                if (err) {
                    dialog.showErrorBox('加载失败', '无法读取扩展文件: ' + err.message);
                    return;
                }
                // 转换为 data URL 发送给渲染进程
                const dataUrl = 'data:text/javascript;base64,' + Buffer.from(data).toString('base64');
                mainWindow.webContents.send('extension-load', dataUrl);
            });
        }
    }).catch(err => {
        console.error('打开扩展文件对话框出错', err);
    });
}

// 更新窗口标题
function updateWindowTitle() {
    if (!mainWindow) return;
    const fileName = currentProjectPath ? path.basename(currentProjectPath) : '未命名项目';
    mainWindow.setTitle(fileName + ' - FrostEditor');
}

// IPC 通信：接收渲染进程发来的项目数据进行保存
ipcMain.on('project-save-data', (event, data) => {
    if (!currentProjectPath) {
        dialog.showErrorBox('保存失败', '没有指定保存路径');
        return;
    }
    
    const buffer = Buffer.from(data);
    fs.writeFile(currentProjectPath, buffer, (err) => {
        if (err) {
            dialog.showErrorBox('保存失败', '无法写入文件: ' + err.message);
        } else {
            console.log('项目已保存到:', currentProjectPath);
        }
    });
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 允许加载本地文件和资源
app.commandLine.appendSwitch('allow-file-access-from-files');

// 允许本地加载扩展
app.commandLine.appendSwitch('allow-file-access');
