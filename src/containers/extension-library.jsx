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
            loadedExtensions: []
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
                
                loadedExtensions.push({
                    id: extensionId,
                    name: extensionId,
                    description: serviceName,
                    iconURL: null
                });
            }
        }
        
        return loadedExtensions;
    }

    handleRemoveExtension (extensionId) {
        const extensionManager = this.props.vm.extensionManager;
        const runtime = this.props.vm.runtime;
        
        // 1. 检查扩展是否存在并获取 serviceName
        const serviceName = extensionManager._loadedExtensions.get(extensionId);
        if (!serviceName) {
            alert(`扩展 ${extensionId} 未找到`);
            return;
        }
        
        // 2. 从 runtime 的 _blockInfo 中移除扩展分类
        const blockInfoIndex = runtime._blockInfo.findIndex(info => info.id === extensionId);
        if (blockInfoIndex !== -1) {
            runtime._blockInfo.splice(blockInfoIndex, 1);
        }
        
        // 3. 清理 worker 相关信息（如果是 worker 模式）
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
        
        // 4. 从 _loadedExtensions 中移除
        extensionManager._loadedExtensions.delete(extensionId);
        
        // 5. 触发扩展移除事件，通知 UI 更新
        this.props.vm.emit('EXTENSION_REMOVED', { id: extensionId });
        
        // 6. 刷新扩展列表
        const loadedExtensions = this.getLoadedExtensions();
        this.setState({
            loadedExtensions: loadedExtensions
        });
        
        // 7. 提示用户
        alert(`扩展 ${extensionId} 已卸载。`);
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
