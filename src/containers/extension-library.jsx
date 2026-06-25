import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';

import LibraryComponent from '../components/library/library.jsx';
import libraryStyles from '../components/library/library.css';
import extensionIcon from '../components/action-menu/icon--sprite.svg';
import ExtensionManagerModal from '../components/tw-extension-manager-modal/extension-manager-modal.jsx';
import collaborationManager from '../lib/collaboration/collaboration-manager.js';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});

let cachedGallery = null;
let cachedAstraExtensions = null;
let cachedUdbbsExtensions = null;

const fetchLibrary = async () => {
    const res = await fetch('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json');
    if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
    }
    const data = await res.json();
    return data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
        iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
        tags: ['tw'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: true
    }));
};

const fetchAstraExtensions = async () => {
    try {
        const res = await fetch('https://editors.astras.top/extensions/generated-metadata/extensions-v0.json');
        if (!res.ok) {
            throw new Error(`HTTP status ${res.status}`);
        }
        const data = await res.json();
        return data.extensions.map((extension, index) => {
            const extensionId = extension.id || `astra-${index}-${extension.slug}`;
            
            return {
                name: extension.name,
                nameTranslations: extension.nameTranslations || {},
                description: extension.description,
                descriptionTranslations: extension.descriptionTranslations || {},
                extensionId: extensionId,
                extensionURL: `https://editors.astras.top/extensions/${extension.slug}.js`,
                iconURL: `https://editors.astras.top/extensions/${extension.image || 'images/unknown.svg'}`,
                tags: ['astra-editor'],
                credits: (extension.by || []).map(credit => {
                    if (credit.link) {
                        return (
                            <a
                                href={credit.link}
                                target="_blank"
                                rel="noreferrer"
                                key={credit.name}
                            >
                                {credit.name}
                            </a>
                        );
                    }
                    return credit.name;
                }),
                docsURI: extension.docs ? `https://editors.astras.top/extensions/${extension.slug}` : null,
                incompatibleWithScratch: true,
                featured: true,
                disabled: false
            };
        });
    } catch (error) {
        console.error('Failed to load AstraEditor extensions:', error);
        return [];
    }
};

const fetchUdbbsExtensions = async () => {
    try {
        const res = await fetch('https://extensions.udbbs.top/json/exts.json');
        if (!res.ok) {
            throw new Error(`HTTP status ${res.status}`);
        }
        const data = await res.json();
        return data.map((extension, index) => {
            const extensionId = `udbbs-${index}-${extension.name}`;
            
            // 从 description 中提取作者信息
            let credits = [];
            const creditMatch = extension.description.match(/由<a[^>]*>([^<]+)<\/a>创建/);
            if (creditMatch) {
                credits.push(creditMatch[1]);
            }
            
            return {
                name: extension.name,
                nameTranslations: {},
                description: extension.description.replace(/<[^>]*>/g, ''), // 移除 HTML 标签
                descriptionTranslations: {},
                extensionId: extensionId,
                extensionURL: extension.url,
                iconURL: `https://extensions.udbbs.top/${extension.image || 'images/unknown.svg'}`,
                tags: ['udbbs'],
                credits: credits,
                docsURI: null,
                incompatibleWithScratch: true,
                featured: true,
                disabled: false
            };
        });
    } catch (error) {
        console.error('Failed to load UDBBS extensions:', error);
        return [];
    }
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
            ,'handleOpenAddonSettings'
            ,'handleExtensionManagerClick'
            ,'handleExtensionManagerClose'
            ,'handleRemoveExtension'
            ,'getLoadedExtensions'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false,
            astraExtensions: cachedAstraExtensions,
            astraError: null,
            udbbsExtensions: cachedUdbbsExtensions,
            udbbsError: null,
            extensionManagerOpen: false,
            loadedExtensions: [],
            extensionInfoMap: {} // 存储扩展 ID 到扩展信息的映射
        };
    }
    handleOpenAddonSettings () {
        try {
            window.dispatchEvent(new CustomEvent('open-addon-settings'));
        } catch (e) {
            // fallback: log
            if (window.console && window.console.error) console.error(e);
        }
    }
    componentDidMount () {
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }

        if (!this.state.astraExtensions) {
            fetchAstraExtensions()
                .then(extensions => {
                    cachedAstraExtensions = extensions;
                    this.setState({
                        astraExtensions: extensions
                    });
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        astraError: error
                    });
                });
        }

        if (!this.state.udbbsExtensions) {
            fetchUdbbsExtensions()
                .then(extensions => {
                    cachedUdbbsExtensions = extensions;
                    this.setState({
                        udbbsExtensions: extensions
                    });
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        udbbsError: error
                    });
                });
        }
        
        // 监听扩展添加事件，保存扩展信息
        this.props.vm.on('EXTENSION_ADDED', this.handleExtensionAdded);
        
        // 初始化已加载扩展的信息（对于组件挂载前就加载的扩展）
        this.initLoadedExtensionsInfo();
    }
    initLoadedExtensionsInfo () {
        // 从 runtime 的 _blockInfo 中获取已加载扩展的信息
        const runtime = this.props.vm.runtime;
        if (runtime && runtime._blockInfo) {
            const extensionInfoMap = {};
            const coreExtensions = [
                'motion', 'looks', 'sound', 'events', 'control', 'sensing', 
                'operators', 'variables', 'myBlocks'
            ];
            
            for (const blockInfo of runtime._blockInfo) {
                // 跳过核心扩展
                if (coreExtensions.includes(blockInfo.id)) {
                    continue;
                }
                
                extensionInfoMap[blockInfo.id] = {
                    id: blockInfo.id,
                    name: blockInfo.name,
                    iconURL: blockInfo.blockIconURI || blockInfo.menuIconURI || null
                };
            }
            
            this.setState({ extensionInfoMap });
        }
    }
    handleExtensionAdded (extensionInfo) {
        // 保存扩展信息到映射中
        this.setState(prevState => ({
            extensionInfoMap: {
                ...prevState.extensionInfoMap,
                [extensionInfo.id]: {
                    id: extensionInfo.id,
                    name: extensionInfo.name,
                    iconURL: extensionInfo.blockIconURI || extensionInfo.menuIconURI || null
                }
            }
        }));
    }
    componentWillUnmount () {
        // 移除事件监听
        if (this.props.vm) {
            this.props.vm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
        }
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (!item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
                this.props.onCategorySelected(extensionId);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url)
                    .then(() => {
                        this.props.onCategorySelected(extensionId);
                    })
                    .catch(err => {
                        log.error(err);
                        // eslint-disable-next-line no-alert
                        alert(err);
                    });
            }
        }
    }

    handleExtensionManagerClick () {
        const loadedExtensions = this.getLoadedExtensions();
        this.setState({
            extensionManagerOpen: true,
            loadedExtensions: loadedExtensions
        });
    }

    handleExtensionManagerClose () {
        this.setState({
            extensionManagerOpen: false
        });
    }

    getLoadedExtensions () {
        const extensionManager = this.props.vm.extensionManager;
        const runtime = this.props.vm.runtime;
        const loadedExtensions = [];
        
        // 核心扩展列表（这些是 Scratch 核心分类，不是扩展）
        const coreExtensions = [
            'motion', 'looks', 'sound', 'events', 'control', 'sensing', 
            'operators', 'variables', 'myBlocks'
        ];
        
        // 从 _loadedExtensions 获取已加载的扩展
        if (extensionManager._loadedExtensions) {
            for (const [extensionId, serviceName] of extensionManager._loadedExtensions.entries()) {
                // 跳过核心扩展
                if (coreExtensions.includes(extensionId)) {
                    continue;
                }
                
                // 跳过自定义扩展入口
                if (extensionId === 'customExtension') {
                    continue;
                }
                
                // 从 runtime._blockInfo 中获取该扩展的积木信息
                let extBlockInfo = null;
                if (runtime && runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
                    extBlockInfo = runtime._blockInfo.find(info => info.id === extensionId);
                }
                
                // 优先从事件保存的扩展信息中获取
                const savedInfo = this.state.extensionInfoMap[extensionId];
                let name = extensionId;
                let description = serviceName;
                let iconURL = null;
                let isBuiltin = false;
                
                // 检查是否是内置扩展
                if (extensionManager.isBuiltinExtension && extensionManager.isBuiltinExtension(extensionId)) {
                    isBuiltin = true;
                }
                
                if (savedInfo) {
                    name = savedInfo.name || extensionId;
                    iconURL = savedInfo.iconURL || null;
                    description = isBuiltin ? '内置扩展' : '';
                } else {
                    description = isBuiltin ? '内置扩展' : serviceName;
                }
                
                // 如果没有保存的信息，尝试从扩展库中匹配
                if (!savedInfo) {
                    // 获取已加载扩展的 URL
                    const extensionURLs = extensionManager.getExtensionURLs ? extensionManager.getExtensionURLs() : {};
                    const extURL = extensionURLs[extensionId];
                    
                    // 收集所有扩展库中的扩展，用于匹配
                    const allLibraryExtensions = [];
                    
                    // 添加本地扩展
                    if (extensionLibraryContent && Array.isArray(extensionLibraryContent)) {
                        allLibraryExtensions.push(...extensionLibraryContent);
                    }
                    
                    // 添加 TurboWarp 扩展
                    if (this.state.gallery && Array.isArray(this.state.gallery)) {
                        allLibraryExtensions.push(...this.state.gallery);
                    }
                    
                    // 添加 AstraEditor 扩展
                    if (this.state.astraExtensions && Array.isArray(this.state.astraExtensions)) {
                        allLibraryExtensions.push(...this.state.astraExtensions);
                    }
                    
                    // 添加 UDBBS 扩展
                    if (this.state.udbbsExtensions && Array.isArray(this.state.udbbsExtensions)) {
                        allLibraryExtensions.push(...this.state.udbbsExtensions);
                    }
                    
                    // 规范化 URL，用于匹配
                    const normalizeURL = (url) => {
                        if (!url) return '';
                        try {
                            const u = new URL(url);
                            return `https://${u.host}${u.pathname}`.toLowerCase();
                        } catch (e) {
                            return url.toLowerCase();
                        }
                    };
                    
                    // 尝试通过 URL 匹配
                    let matchedExtension = null;
                    if (extURL) {
                        const normalizedURL = normalizeURL(extURL);
                        matchedExtension = allLibraryExtensions.find(ext => 
                            ext.extensionURL && normalizeURL(ext.extensionURL) === normalizedURL
                        );
                    }
                    
                    // 如果没找到，尝试通过 extensionId 匹配
                    if (!matchedExtension) {
                        matchedExtension = allLibraryExtensions.find(ext => 
                            ext.extensionId === extensionId
                        );
                    }
                    
                    if (matchedExtension) {
                        name = matchedExtension.name || extensionId;
                        description = isBuiltin ? '内置扩展' : (matchedExtension.description || '');
                        iconURL = matchedExtension.iconURL || null;
                    }
                }
                
                loadedExtensions.push({
                    id: extensionId,
                    name: name,
                    description: description,
                    iconURL: iconURL,
                    isBuiltin: isBuiltin,
                    blocks: extBlockInfo ? extBlockInfo.blocks || [] : []
                });
            }
        }
        
        return loadedExtensions;
    }

    handleRemoveExtension (extensionId) {
        const extensionManager = this.props.vm.extensionManager;
        const runtime = this.props.vm.runtime;
        
        try {
            // 0. 获取该扩展的所有积木 opcode
            const extensionOpcodes = new Set();
            if (runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
                const extInfo = runtime._blockInfo.find(info => info.id === extensionId);
                if (extInfo && extInfo.blocks) {
                    for (const block of extInfo.blocks) {
                        if (block.opcode) {
                            extensionOpcodes.add(block.opcode);
                        }
                    }
                }
            }
            
            // 0.1 从 VM 中删除积木
            if (runtime && runtime.targets && extensionOpcodes.size > 0) {
                const blocksToDelete = [];
                
                for (const target of runtime.targets) {
                    if (target.blocks && target.blocks._blocks) {
                        const blocks = target.blocks._blocks;
                        for (const blockId in blocks) {
                            if (Object.prototype.hasOwnProperty.call(blocks, blockId)) {
                                const block = blocks[blockId];
                                if (block.opcode && extensionOpcodes.has(block.opcode)) {
                                    blocksToDelete.push({ target, blockId });
                                }
                            }
                        }
                    }
                }
                
                for (const { target, blockId } of blocksToDelete) {
                    if (target.blocks && target.blocks.deleteBlock) {
                        target.blocks.deleteBlock(blockId);
                    }
                }
            }
            
            // 0.2 直接从 Blockly 工作区删除积木（确保 UI 上也消失）
            if (typeof Blockly !== 'undefined') {
                const workspace = Blockly.getMainWorkspace();
                if (workspace) {
                    const allBlocks = workspace.getAllBlocks();
                    const blocksToRemove = allBlocks.filter(block => {
                        return extensionOpcodes.has(block.type);
                    });
                    for (const block of blocksToRemove) {
                        block.dispose(true);
                    }
                }
            }
            
            // 1. 检查扩展是否存在并获取 serviceName
            let serviceName = null;
            if (extensionManager._loadedExtensions instanceof Map) {
                serviceName = extensionManager._loadedExtensions.get(extensionId);
            } else if (typeof extensionManager._loadedExtensions === 'object') {
                serviceName = extensionManager._loadedExtensions[extensionId];
            }
            
            if (!serviceName) {
                alert(`扩展 ${extensionId} 未找到`);
                return;
            }
            
            // 2. 从 runtime 的 _blockInfo 中移除扩展分类
            if (runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
                const blockInfoIndex = runtime._blockInfo.findIndex(info => info.id === extensionId);
                if (blockInfoIndex !== -1) {
                    runtime._blockInfo.splice(blockInfoIndex, 1);
                }
            }
            
            // 3. 清理 worker 相关信息（如果是 worker 模式）
            if (typeof serviceName === 'string') {
                const workerIdMatch = serviceName.match(/extension_(\d+)_/);
                if (workerIdMatch) {
                    const workerId = parseInt(workerIdMatch[1]);
                    if (extensionManager.workerURLs && extensionManager.workerURLs[workerId]) {
                        delete extensionManager.workerURLs[workerId];
                    }
                    if (extensionManager.pendingWorkers && extensionManager.pendingWorkers[workerId]) {
                        delete extensionManager.pendingWorkers[workerId];
                    }
                }
            }
            
            // 4. 从 _loadedExtensions 中移除
            if (extensionManager._loadedExtensions instanceof Map) {
                extensionManager._loadedExtensions.delete(extensionId);
            } else if (typeof extensionManager._loadedExtensions === 'object') {
                delete extensionManager._loadedExtensions[extensionId];
            }
            
            // 5. 触发扩展移除事件，通知 UI 更新
            if (this.props.vm.emit) {
                this.props.vm.emit('EXTENSION_REMOVED', { id: extensionId });
            }

            // 6. 同步到协作房间（如果在协作中）
            try {
                if (collaborationManager && collaborationManager.isConnected) {
                    collaborationManager.sendExtensionUnload(extensionId);
                }
            } catch (e) {
                // 忽略协作同步错误
            }

            // 7. 刷新扩展列表
            const loadedExtensions = this.getLoadedExtensions();
            this.setState({
                loadedExtensions: loadedExtensions
            });
            
            // 7. 提示用户
            alert(`扩展 ${extensionId} 已卸载。`);
        } catch (error) {
            console.error('Failed to remove extension:', error);
            alert(`卸载扩展失败：${error.message}`);
        }
    }

    render () {
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            library = extensionLibraryContent.map(toLibraryItem);
            library.push('---');
            if (this.state.gallery) {
                library.push(toLibraryItem(galleryMore));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.gallery
                        .filter(i => i.extensionId !== 'faceSensing')
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                );
            } else if (this.state.galleryError) {
                library.push(toLibraryItem(galleryError));
            } else {
                library.push(toLibraryItem(galleryLoading));
            }

            // 添加 AstraEditor 扩展
            if (this.state.astraExtensions && this.state.astraExtensions.length > 0) {
                library.push('---');
                library.push(toLibraryItem({
                    name: 'AstraEditor 扩展库',
                    extensionId: 'astra-editor-gallery',
                    iconURL: 'https://editors.astras.top/favicon.ico',
                    description: '来自 AstraEditor 的扩展收集',
                    href: 'https://editors.astras.top/extensions',
                    tags: ['astra-editor'],
                    featured: true
                }));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.astraExtensions
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                );
            }

            // 添加 UDBBS 扩展
            if (this.state.udbbsExtensions && this.state.udbbsExtensions.length > 0) {
                library.push('---');
                library.push(toLibraryItem({
                    name: 'UDBBS 扩展库',
                    extensionId: 'udbbs-gallery',
                    iconURL: 'https://extensions.udbbs.top/favicon.ico',
                    description: '来自 UDBBS 的扩展收集',
                    href: 'https://extensions.udbbs.top/',
                    tags: ['udbbs'],
                    featured: true
                }));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.udbbsExtensions
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                );
            }
            
            // 去重：屏蔽与其他分类 ID 相同的扩展
            const seenExtensionIds = new Set();
            const deduplicatedLibrary = [];
            
            for (const item of library) {
                // 分隔符直接添加
                if (item === '---') {
                    deduplicatedLibrary.push(item);
                    continue;
                }
                
                // 如果是对象且有 extensionId，检查是否重复
                if (typeof item === 'object' && item.extensionId) {
                    // 跳过特殊的分类标题项（如 gallery 标题）
                    if (item.href && item.extensionId.endsWith('-gallery')) {
                        deduplicatedLibrary.push(item);
                        continue;
                    }
                    
                    // 如果已经出现过相同的 extensionId，跳过
                    if (seenExtensionIds.has(item.extensionId)) {
                        continue;
                    }
                    seenExtensionIds.add(item.extensionId);
                }
                
                deduplicatedLibrary.push(item);
            }
            
            library = deduplicatedLibrary;
        }

        return (
            <React.Fragment>
                <LibraryComponent
                    data={library}
                    filterable
                    persistableKey="extensionId"
                    id="extensionLibrary"
                    tags={extensionTags}
                    title={this.props.intl.formatMessage(messages.extensionTitle)}
                    visible={this.props.visible}
                    onItemSelected={this.handleItemSelect}
                    onRequestClose={this.props.onRequestClose}
                    onExtensionManagerClick={this.handleExtensionManagerClick}
                />
                {this.state.extensionManagerOpen && (
                    <ExtensionManagerModal
                        extensions={this.state.loadedExtensions}
                        onRemoveExtension={this.handleRemoveExtension}
                        onClose={this.handleExtensionManagerClose}
                    />
                )}
            </React.Fragment>
        );
    }
}

// Render a floating manage button inside the extension library modal area
ExtensionLibrary.prototype.render = ExtensionLibrary.prototype.render || ExtensionLibrary.prototype.render;

// Append FAB after component mount using portal-like approach in this file's render flow
// Simpler: patching to render the button alongside the LibraryComponent via wrapping div

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
