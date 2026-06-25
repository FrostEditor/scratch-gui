const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 绂佺敤纭欢鍔犻€熷彲鑳戒細瑙ｅ喅涓€浜涙覆鏌撻棶棰?
// app.disableHardwareAcceleration();

let mainWindow;
let currentProjectPath = null; // 褰撳墠鎵撳紑鐨勬枃浠惰矾寰?

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'FrostEditor',
        icon: path.join(__dirname, 'build', 'images', '512.png'),
        backgroundColor: '#111111', // 娣辫壊鑳屾櫙锛屽拰涓婚涓€鑷?
        show: false, // 鍏堥殣钘忥紝绛夊姞杞藉畬鍐嶆樉绀?
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false, // 鍏抽棴娌欑锛屾柟渚?preload 鑴氭湰
            preload: path.join(__dirname, '../src-preload/preload.js')
        }
    });

    // 鍔犺浇瀹屾垚鍚庢樉绀虹獥鍙ｏ紝閬垮厤鐧藉睆
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 鍔犺浇鏋勫缓鍚庣殑缂栬緫鍣紙鐩存帴杩涘叆缂栬緫鍣ㄩ〉闈級
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'build', 'editor.html')}`;
    mainWindow.loadURL(startUrl);

    // 鎵撳紑寮€鍙戣€呭伐鍏凤紙寮€鍙戞椂鐢紝鎵撳寘鏃舵敞閲婃帀锛?
    // mainWindow.webContents.openDevTools();

    // 鎵€鏈夊閾惧湪娴忚鍣ㄤ腑鎵撳紑
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 鍒涘缓鑿滃崟
    createMenu();
}

// 鍒涘缓鑿滃崟
function createMenu() {
    const template = [
        {
            label: '鏂囦欢',
            submenu: [
                {
                    label: '鏂板缓',
                    accelerator: 'Ctrl+N',
                    click: () => {
                        createNewProject();
                    }
                },
                {
                    label: '鎵撳紑...',
                    accelerator: 'Ctrl+O',
                    click: () => {
                        openProject();
                    }
                },
                {
                    label: '淇濆瓨',
                    accelerator: 'Ctrl+S',
                    click: () => {
                        saveProject();
                    }
                },
                {
                    label: '鍙﹀瓨涓?..',
                    accelerator: 'Ctrl+Shift+S',
                    click: () => {
                        saveProjectAs();
                    }
                },
                { type: 'separator' },
                {
                    label: '浠庣數鑴戝姞杞芥墿灞?..',
                    click: () => {
                        loadExtensionFromFile();
                    }
                },
                { type: 'separator' },
                { role: 'quit', label: '閫€鍑? }
            ]
        },
        {
            label: '缂栬緫',
            submenu: [
                { role: 'undo', label: '鎾ら攢' },
                { role: 'redo', label: '閲嶅仛' },
                { type: 'separator' },
                { role: 'cut', label: '鍓垏' },
                { role: 'copy', label: '澶嶅埗' },
                { role: 'paste', label: '绮樿创' },
                { role: 'selectAll', label: '鍏ㄩ€? }
            ]
        },
        {
            label: '鏌ョ湅',
            submenu: [
                { role: 'reload', label: '閲嶆柊鍔犺浇' },
                { role: 'forceReload', label: '寮哄埗閲嶆柊鍔犺浇' },
                { role: 'toggleDevTools', label: '寮€鍙戣€呭伐鍏? },
                { type: 'separator' },
                { role: 'resetZoom', label: '閲嶇疆缂╂斁' },
                { role: 'zoomIn', label: '鏀惧ぇ' },
                { role: 'zoomOut', label: '缂╁皬' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '鍏ㄥ睆' }
            ]
        },
        {
            label: '甯姪',
            submenu: [
                {
                    label: '鍏充簬 FrostEditor',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '鍏充簬 FrostEditor',
                            message: 'FrostEditor',
                            detail: '鍩轰簬 Scratch 3.0 鐨勫浜哄崗浣滅紪杈戝櫒\n\n鐗堟湰: ' + app.getVersion() + '\n\nhttps://github.com/FrostEditor'
                        });
                    }
                },
                {
                    label: '璁块棶瀹樼綉',
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

// 鏂板缓椤圭洰
function createNewProject() {
    if (!mainWindow) return;
    mainWindow.webContents.send('project-new');
    currentProjectPath = null;
    updateWindowTitle();
}

// 鎵撳紑椤圭洰
function openProject() {
    if (!mainWindow) return;
    
    dialog.showOpenDialog(mainWindow, {
        title: '鎵撳紑椤圭洰',
        filters: [
            { name: 'Scratch 椤圭洰', extensions: ['sb3', 'sb2', 'sb'] },
            { name: '鎵€鏈夋枃浠?, extensions: ['*'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    dialog.showErrorBox('鎵撳紑澶辫触', '鏃犳硶璇诲彇鏂囦欢: ' + err.message);
                    return;
                }
                // 鍙戦€佺粰娓叉煋杩涚▼鍔犺浇
                mainWindow.webContents.send('project-load', {
                    data: data.buffer, // ArrayBuffer
                    path: filePath
                });
                currentProjectPath = filePath;
                updateWindowTitle();
            });
        }
    }).catch(err => {
        console.error('鎵撳紑鏂囦欢瀵硅瘽妗嗗嚭閿?', err);
    });
}

// 淇濆瓨椤圭洰
function saveProject() {
    if (!mainWindow) return;
    
    if (currentProjectPath) {
        // 宸叉湁璺緞锛岀洿鎺ヤ繚瀛?
        mainWindow.webContents.send('project-save-request');
    } else {
        // 娌℃湁璺緞锛屽彟瀛樹负
        saveProjectAs();
    }
}

// 鍙﹀瓨涓?
function saveProjectAs() {
    if (!mainWindow) return;
    
    dialog.showSaveDialog(mainWindow, {
        title: '淇濆瓨椤圭洰',
        defaultPath: '鏈懡鍚嶉」鐩?sb3',
        filters: [
            { name: 'Scratch 3 椤圭洰', extensions: ['sb3'] }
        ]
    }).then(result => {
        if (!result.canceled && result.filePath) {
            currentProjectPath = result.filePath;
            updateWindowTitle();
            // 璇锋眰娓叉煋杩涚▼鍙戦€侀」鐩暟鎹?
            mainWindow.webContents.send('project-save-request');
        }
    }).catch(err => {
        console.error('淇濆瓨鏂囦欢瀵硅瘽妗嗗嚭閿?', err);
    });
}

// 浠庢枃浠跺姞杞芥墿灞?
function loadExtensionFromFile() {
    if (!mainWindow) return;
    
    dialog.showOpenDialog(mainWindow, {
        title: '鍔犺浇鎵╁睍',
        filters: [
            { name: 'JavaScript 鏂囦欢', extensions: ['js'] },
            { name: '鎵€鏈夋枃浠?, extensions: ['*'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            fs.readFile(filePath, 'utf-8', (err, data) => {
                if (err) {
                    dialog.showErrorBox('鍔犺浇澶辫触', '鏃犳硶璇诲彇鎵╁睍鏂囦欢: ' + err.message);
                    return;
                }
                // 杞崲涓?data URL 鍙戦€佺粰娓叉煋杩涚▼
                const dataUrl = 'data:text/javascript;base64,' + Buffer.from(data).toString('base64');
                mainWindow.webContents.send('extension-load', dataUrl);
            });
        }
    }).catch(err => {
        console.error('鎵撳紑鎵╁睍鏂囦欢瀵硅瘽妗嗗嚭閿?', err);
    });
}

// 鏇存柊绐楀彛鏍囬
function updateWindowTitle() {
    if (!mainWindow) return;
    const fileName = currentProjectPath ? path.basename(currentProjectPath) : '鏈懡鍚嶉」鐩?;
    mainWindow.setTitle(fileName + ' - FrostEditor');
}

// IPC 閫氫俊锛氭帴鏀舵覆鏌撹繘绋嬪彂鏉ョ殑椤圭洰鏁版嵁杩涜淇濆瓨
ipcMain.on('project-save-data', (event, data) => {
    if (!currentProjectPath) {
        dialog.showErrorBox('淇濆瓨澶辫触', '娌℃湁鎸囧畾淇濆瓨璺緞');
        return;
    }
    
    const buffer = Buffer.from(data);
    fs.writeFile(currentProjectPath, buffer, (err) => {
        if (err) {
            dialog.showErrorBox('淇濆瓨澶辫触', '鏃犳硶鍐欏叆鏂囦欢: ' + err.message);
        } else {
            console.log('椤圭洰宸蹭繚瀛樺埌:', currentProjectPath);
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

// 鍏佽鍔犺浇鏈湴鏂囦欢鍜岃祫婧?
app.commandLine.appendSwitch('allow-file-access-from-files');

// 鍏佽鏈湴鍔犺浇鎵╁睍
app.commandLine.appendSwitch('allow-file-access');
