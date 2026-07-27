import {defineMessages, injectIntl, intlShape} from 'react-intl';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
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
        this.resizeTimers = [];
        this.state = {
            status: 'loading' // loading | ok | empty | unavailable
        };
    }

    componentDidMount () {
        this.renderBlocks();
    }

    componentWillUnmount () {
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

    disposeWorkspace () {
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
            const config = Object.assign({}, PREVIEW_OPTIONS, {rtl: this.props.isRtl}, {media});
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
