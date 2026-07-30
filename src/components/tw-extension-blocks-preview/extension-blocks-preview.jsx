import {defineMessages, injectIntl, intlShape} from 'react-intl';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
import defineDynamicBlock from '../../lib/define-dynamic-block';
import {Theme} from '../../lib/themes';
import styles from './extension-blocks-preview.css';

// 预览工作区的选项——与 scratch-gui 自身的第二工作区（custom-procedures）
// 保持一致，使渲染出的积木看起来和编辑器里一模一样。
const PREVIEW_OPTIONS = {
    readOnly: true,
    comments: false,
    collapse: false,
    scrollbars: true,
    trashcan: false,
    zoom: {
        controls: false,
        wheel: true,
        startScale: 1,
        maxScale: 1,
        minScale: 0.5
    }
};

// 触摸设备检测：手机/平板上启用缩放按钮并缩小初始比例。
const isTouchDevice = () => typeof window !== 'undefined' && (
    ('ontouchstart' in window) ||
    (window.navigator && window.navigator.maxTouchPoints > 0)
);

// 小屏检测（手机竖屏等）。
const isSmallScreen = () => typeof window !== 'undefined' && window.innerWidth < 768;

/**
 * 全屏（或任意容器）积木预览画布。
 *
 * 只负责把传入的积木（blocks）渲染进一个 scratch-blocks 工作区，并管理
 * loading / ok / empty / unavailable 四种状态。它本身不带标题栏和关闭按钮，
 * 由外层（弹窗或独立页面）自行包裹。
 *
 * 复用了 tw-extension-blocks-modal 的渲染逻辑，保证两处行为一致。
 */
const messages = defineMessages({
    loading: {
        defaultMessage: 'Loading blocks…',
        description: 'Shown while the extension block preview is rendering',
        id: 'tw.extensionBlocks.loading'
    },
    empty: {
        defaultMessage: 'No blocks were found for this extension.',
        description: 'Shown when the extension has no blocks to display',
        id: 'tw.extensionBlocks.empty'
    },
    unavailable: {
        defaultMessage: 'The block renderer is not available right now. Please try again in a moment.',
        description: 'Shown when the Blockly renderer could not be initialised',
        id: 'tw.extensionBlocks.unavailable'
    }
});

class ExtensionBlocksPreview extends React.Component {
    constructor (props) {
        super(props);
        this.containerRef = React.createRef();
        this.workspace = null;
        this._realMain = null;
        this._attempts = 0;
        this._maxAttempts = 30; // 最多约 3s 重试，等待引擎 / 容器挂载
        this._retryReason = null;
        this._pinchContainer = null;
        this.resizeTimers = [];
        this.state = {
            status: 'loading' // loading | ok | empty | unavailable
        };
        // 手机端旋转屏幕 / 地址栏收起时重算画布尺寸。
        this._onWindowResize = () => {
            if (this.workspace && this.workspace.resize) {
                try {
                    this.workspace.resize();
                } catch (e) { /* ignore */ }
            }
        };
    }

    componentDidMount () {
        this.renderBlocks();
        window.addEventListener('resize', this._onWindowResize);
        window.addEventListener('orientationchange', this._onWindowResize);
    }

    componentWillUnmount () {
        window.removeEventListener('resize', this._onWindowResize);
        window.removeEventListener('orientationchange', this._onWindowResize);
        this.disposeWorkspace();
    }

    // 取得编辑器真正使用的 scratch-blocks 单例。
    getScratchBlocks () {
        try {
            const sb = LazyScratchBlocks.get();
            if (sb && sb.inject) {
                return sb;
            }
        } catch (e) {
            // 忽略，回退到 window.ScratchBlocks
        }
        if (typeof window !== 'undefined' && window.ScratchBlocks && window.ScratchBlocks.inject) {
            return window.ScratchBlocks;
        }
        return null;
    }

    // 收集本扩展真实的 <block> XML 字符串。
    getBlockXmls () {
        // 只保留真正的 workspace 积木（<block ...>），过滤掉工具箱标签/分隔符。
        const keepXml = b => b && b.xml && /^\s*<block\b/i.test(b.xml);
        if (this.props.blocks && this.props.blocks.length > 0) {
            const xmls = this.props.blocks.filter(keepXml).map(b => b.xml);
            if (xmls.length) return xmls;
        }
        // 未直接传 blocks 时，按 extensionId 从 _blockInfo 反查。
        const runtime = this.props.vm && this.props.vm.runtime;
        if (this.props.extensionId && runtime && runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
            let info = runtime._blockInfo.find(i => i.id === this.props.extensionId);
            if (!info) {
                info = runtime._blockInfo.find(i =>
                    i.blocks && i.blocks.some(b =>
                        b.info && b.info.opcode && b.info.opcode.startsWith(`${this.props.extensionId}_`)));
            }
            if (info && info.blocks) {
                const xmls = info.blocks.filter(keepXml).map(b => b.xml);
                if (xmls.length) return xmls;
            }
        }
        return [];
    }

    // 关键修复：把浏览 VM 里已加载扩展的「积木视觉定义」补注册到全局 scratch-blocks。
    //
    // 编辑器里积木定义的注册链路是 blocks.jsx 监听主 VM 的 EXTENSION_ADDED →
    // defineBlocksWithJsonArray / defineDynamicBlock。但「浏览积木」的扩展加载在
    // 独立的浏览 VM 上，它的 EXTENSION_ADDED 没有任何人监听——积木类型从未注册，
    // domToWorkspace 渲出来的就是残缺/错误积木（无文字、无形状、黑色裸块）。
    //
    // 这里在渲染前扫描浏览 VM runtime._blockInfo 的全部分类，把**缺失的**类型
    // 补定义进全局 ScratchBlocks。只补缺、绝不覆盖编辑器已注册的同名定义，
    // 避免影响主工作区。主题用默认三代配色（BLOCKS_THREE 下 inject 原样返回，
    // 保留扩展自带颜色）。
    defineMissingBlocks (ScratchBlocks) {
        const runtime = this.props.vm && this.props.vm.runtime;
        if (!runtime || !Array.isArray(runtime._blockInfo)) return;
        const theme = Theme.light; // blocks === BLOCKS_THREE，不改扩展自带配色
        for (const categoryInfo of runtime._blockInfo) {
            const defineBlocks = blockInfoArray => {
                if (!blockInfoArray || !blockInfoArray.length) return;
                const staticBlocksJson = [];
                blockInfoArray.forEach(blockInfo => {
                    if (blockInfo && blockInfo.info && blockInfo.info.isDynamic) {
                        const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                        if (!ScratchBlocks.Blocks[extendedOpcode]) {
                            ScratchBlocks.Blocks[extendedOpcode] = defineDynamicBlock(
                                ScratchBlocks,
                                categoryInfo,
                                blockInfo,
                                extendedOpcode,
                                theme
                            );
                        }
                    } else if (blockInfo && blockInfo.json) {
                        // 只补缺失的类型，避免重定义警告与覆盖编辑器主题化定义。
                        if (blockInfo.json.type && !ScratchBlocks.Blocks[blockInfo.json.type]) {
                            staticBlocksJson.push(blockInfo.json);
                        }
                    }
                    // 其余为 '---' 之类的非积木条目，忽略。
                });
                if (staticBlocksJson.length) {
                    try {
                        ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
                    } catch (e) {
                        // 单个坏定义不应导致整个预览失败
                        // eslint-disable-next-line no-console
                        console.warn('EXTBLOCKS_DEFINE_WARN', e);
                    }
                }
            };
            try {
                defineBlocks(
                    Object.getOwnPropertyNames(categoryInfo.customFieldTypes || {})
                        .map(fieldTypeName => categoryInfo.customFieldTypes[fieldTypeName].scratchBlocksDefinition));
                defineBlocks(categoryInfo.menus);
                defineBlocks(categoryInfo.blocks);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('EXTBLOCKS_DEFINE_WARN', e);
            }
        }
    }

    // 手机端双指捏合缩放。本 fork 的 scratch-blocks 只支持单指触摸拖动，
    // 没有内置 pinch，这里在捕获阶段拦截双指手势自行缩放，
    // 单指平移仍然交给积木引擎处理。
    bindPinchZoom (container) {
        if (this._pinchContainer || !container) return;
        this._pinchContainer = container;
        this._pinchDist = 0;
        this._pinchScale = 1;
        const getDist = touches => Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
        this._onPinchStart = e => {
            if (e.touches.length === 2 && this.workspace) {
                e.preventDefault();
                e.stopPropagation();
                this._pinchDist = getDist(e.touches);
                this._pinchScale = this.workspace.scale || 1;
            }
        };
        this._onPinchMove = e => {
            if (e.touches.length === 2 && this.workspace && this._pinchDist > 0) {
                e.preventDefault();
                e.stopPropagation();
                const ratio = getDist(e.touches) / this._pinchDist;
                const scale = Math.min(1.5, Math.max(0.35, this._pinchScale * ratio));
                try {
                    this.workspace.setScale(scale);
                } catch (err) { /* ignore */ }
            }
        };
        this._onPinchEnd = e => {
            if (!e.touches || e.touches.length < 2) {
                this._pinchDist = 0;
            }
        };
        container.addEventListener('touchstart', this._onPinchStart, {capture: true, passive: false});
        container.addEventListener('touchmove', this._onPinchMove, {capture: true, passive: false});
        container.addEventListener('touchend', this._onPinchEnd, true);
        container.addEventListener('touchcancel', this._onPinchEnd, true);
    }

    unbindPinchZoom () {
        const container = this._pinchContainer;
        if (!container) return;
        container.removeEventListener('touchstart', this._onPinchStart, {capture: true});
        container.removeEventListener('touchmove', this._onPinchMove, {capture: true});
        container.removeEventListener('touchend', this._onPinchEnd, true);
        container.removeEventListener('touchcancel', this._onPinchEnd, true);
        this._pinchContainer = null;
    }

    disposeWorkspace () {
        this.unbindPinchZoom();
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.resizeTimers.forEach(id => {
            try {
                clearTimeout(id);
            } catch (e) { /* ignore */ }
        });
        this.resizeTimers = [];
        const ScratchBlocks = this.getScratchBlocks();
        if (this.workspace && ScratchBlocks) {
            try {
                this.workspace.dispose();
            } catch (e) {
                // ignore disposal errors
            }
            this.workspace = null;
            // 恢复编辑器真实的主工作区，保证它继续可用。
            if (this._realMain) {
                try {
                    ScratchBlocks.mainWorkspace = this._realMain;
                } catch (e) {
                    // ignore
                }
                this._realMain = null;
            }
        }
    }

    renderBlocks () {
        const ScratchBlocks = this.getScratchBlocks();
        if (!ScratchBlocks || !ScratchBlocks.inject) {
            // 引擎还没就绪——稍后重试。
            if (this._attempts < this._maxAttempts) {
                this._attempts++;
                this.retryTimer = setTimeout(() => this.renderBlocks(), 100);
            } else {
                this.setState({status: 'unavailable'});
            }
            return;
        }

        // 容器必须已挂到文档上才能 inject。嵌套在 ReactModal 里时父弹窗的
        // portal 可能尚未 attach，导致 inject 抛 "container is not in current document"。
        const container = this.containerRef.current;
        if (!container || !container.parentNode || container.ownerDocument !== document) {
            return this.scheduleRetry('container');
        }

        const xmls = this.getBlockXmls();
        if (xmls.length === 0) {
            this.setState({status: 'empty'});
            return;
        }

        // 渲染前先把浏览 VM 中扩展的积木类型定义补进全局 ScratchBlocks，
        // 否则 domToWorkspace 遇到未定义类型会渲出残缺/错误积木。
        this.defineMissingBlocks(ScratchBlocks);

        // 在 inject 之前捕获编辑器的真实主工作区。inject 会覆盖
        // Blockly.mainWorkspace，注入后立即恢复。
        let realMain = null;
        try {
            realMain = (ScratchBlocks.getMainWorkspace && ScratchBlocks.getMainWorkspace()) ||
                ScratchBlocks.mainWorkspace;
        } catch (e) {
            realMain = null;
        }
        this._realMain = realMain;

        let media = 'https://scratch.mit.edu/blocks-media/';
        if (realMain && realMain.options && realMain.options.media) {
            media = realMain.options.media;
        }

        try {
            const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
            ScratchBlocks.Blocks.defaultToolbox = null;
            // 手机端适配：小屏 / 触摸设备上显示缩放按钮、允许捏合缩放、
            // 并用更小的初始比例让积木一屏内可见。
            const touch = isTouchDevice();
            const small = isSmallScreen();
            const zoom = Object.assign({}, PREVIEW_OPTIONS.zoom, {
                controls: touch || small,
                startScale: small ? 0.65 : 1,
                minScale: 0.35,
                maxScale: small ? 1.25 : 1
            });
            const config = Object.assign({}, PREVIEW_OPTIONS, {
                rtl: this.props.isRtl,
                media,
                zoom
            });
            this.workspace = ScratchBlocks.inject(this.containerRef.current, config);
            ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

            // 立即恢复编辑器的主工作区，使其保持可用。
            if (realMain) {
                try {
                    ScratchBlocks.mainWorkspace = realMain;
                } catch (e) {
                    // ignore
                }
            }

            if (this.workspace.resize) {
                try {
                    this.workspace.resize();
                } catch (e) { /* ignore */ }
            }

            const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${xmls.join('')}</xml>`;
            ScratchBlocks.Xml.domToWorkspace(ScratchBlocks.Xml.textToDom(xml), this.workspace);

            // 若什么都没渲染出来（坏 XML 等），显示空状态而非空白。
            if (this.workspace.getAllBlocks().length === 0) {
                this.disposeWorkspace();
                this.setState({status: 'empty'});
                return;
            }

            // 让顶层积木纵向排开，避免互相重叠。
            const topBlocks = this.workspace.getTopBlocks(true);
            let y = 24;
            topBlocks.forEach(block => {
                block.moveBy(0, y);
                const size = (block.getHeightWidth && block.getHeightWidth()) || {height: 48};
                y += size.height + 24;
            });

            if (this.workspace.render) {
                try {
                    this.workspace.render();
                } catch (e) { /* ignore */ }
            }
            if (this.workspace.resize) {
                try {
                    this.workspace.resize();
                } catch (e) { /* ignore */ }
            }

            // 触摸设备：绑定双指捏合缩放。
            if (touch) {
                this.bindPinchZoom(this.containerRef.current);
            }

            this.setState({status: 'ok'});

            // 弹窗（或父容器）可能还在 settle 到最终尺寸；多算几次 resize，
            // 防止积木跑到屏幕外或 0 尺寸。
            [0, 150, 350].forEach(delay => {
                const id = setTimeout(() => {
                    if (this.workspace && this.workspace.resize) {
                        try {
                            this.workspace.resize();
                        } catch (e) { /* ignore */ }
                    }
                }, delay);
                this.resizeTimers.push(id);
            });
        } catch (e) {
            // "container is not in current document" 是嵌套弹窗的时序问题——重试；
            // 否则放弃并给出明确提示。
            if (this._attempts < this._maxAttempts &&
                /not in current document|container/i.test((e && e.message) || '')) {
                return this.scheduleRetry('inject-error');
            }
            // eslint-disable-next-line no-console
            console.error('EXTBLOCKS_RENDER_ERROR', e && (e.stack || e.message || e));
            this.disposeWorkspace();
            this.setState({status: 'unavailable'});
        }
    }

    scheduleRetry (reason) {
        if (this._attempts < this._maxAttempts) {
            this._attempts++;
            this._retryReason = reason;
            this.retryTimer = setTimeout(() => this.renderBlocks(), 100);
        } else {
            this.setState({status: 'unavailable'});
        }
    }

    render () {
        const status = this.state.status;
        const intl = this.props.intl;
        return (
            <div
                className={classNames(styles.workspaceWrapper, {
                    [styles.frameless]: this.props.frameless
                })}
            >
                <div
                    ref={this.containerRef}
                    className={styles.blocklyContainer}
                    style={{display: (status === 'loading' || status === 'ok') ? 'block' : 'none'}}
                />
                {status === 'loading' && (
                    <div className={styles.placeholder}>{intl.formatMessage(messages.loading)}</div>
                )}
                {status === 'empty' && (
                    <div className={styles.placeholder}>{intl.formatMessage(messages.empty)}</div>
                )}
                {status === 'unavailable' && (
                    <div className={styles.placeholder}>{intl.formatMessage(messages.unavailable)}</div>
                )}
            </div>
        );
    }
}

ExtensionBlocksPreview.propTypes = {
    blocks: PropTypes.array, // eslint-disable-line react/forbid-prop-types
    extensionId: PropTypes.string,
    frameless: PropTypes.bool,
    intl: intlShape,
    isRtl: PropTypes.bool,
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

export default injectIntl(ExtensionBlocksPreview);
