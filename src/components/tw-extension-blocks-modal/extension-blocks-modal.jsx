import {defineMessages, injectIntl, intlShape} from 'react-intl';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import LazyScratchBlocks from '../../lib/tw-lazy-scratch-blocks';
import styles from './extension-blocks-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Extension Blocks',
        description: 'Title of the extension blocks preview modal',
        id: 'tw.extensionBlocks.title'
    },
    loading: {
        defaultMessage: 'Loading blocks…',
        description: 'Shown while the block preview is rendering',
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
    },
    close: {
        defaultMessage: 'Close',
        description: 'Button to close the modal',
        id: 'tw.extensionBlocks.close'
    }
});

// Options for the preview workspace — mirrors scratch-gui's own second-workspace
// pattern (custom-procedures) so the rendered blocks look exactly like the editor.
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

class ExtensionBlocksModal extends React.Component {
    constructor (props) {
        super(props);
        this.containerRef = React.createRef();
        this.workspace = null;
        this._realMain = null;
        this._attempts = 0;
        this._maxAttempts = 12; // ~1.2s of retries if the renderer is still loading
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

    // Pulls the real Blockly (scratch-blocks) singleton that the editor uses.
    getScratchBlocks () {
        try {
            return LazyScratchBlocks.get();
        } catch (e) {
            return null;
        }
    }

    // Collects the real <block> XML strings for this extension.
    getBlockXmls () {
        // Only keep real workspace blocks (<block ...>), not toolbox labels/separators.
        const keepXml = b => b && b.xml && /^\s*<block\b/i.test(b.xml);
        // Use the caller-supplied blocks ONLY if it actually has items;
        // otherwise fall through to query _blockInfo directly.
        if (this.props.blocks && this.props.blocks.length > 0) {
            const xmls = this.props.blocks.filter(keepXml).map(b => b.xml);
            if (xmls.length) return xmls;
        }
        const runtime = this.props.vm && this.props.vm.runtime;
        if (runtime && runtime._blockInfo && Array.isArray(runtime._blockInfo)) {
            let info = runtime._blockInfo.find(i => i.id === this.props.extensionId);
            if (!info) {
                info = runtime._blockInfo.find(i =>
                    i.blocks && i.blocks.some(b =>
                        b.info && b.info.opcode && b.info.opcode.startsWith(this.props.extensionId + '_')));
            }
            if (info && info.blocks) {
                const xmls = info.blocks.filter(keepXml).map(b => b.xml);
                if (xmls.length) return xmls;
            }
        }
        return [];
    }

    disposeWorkspace () {
        const ScratchBlocks = this.getScratchBlocks();
        if (this.workspace && ScratchBlocks) {
            try {
                this.workspace.dispose();
            } catch (e) {
                // ignore disposal errors
            }
            this.workspace = null;
            // Restore the editor's real main workspace so it keeps working.
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
            // Renderer not ready yet — retry shortly.
            if (this._attempts < this._maxAttempts) {
                this._attempts++;
                this.retryTimer = setTimeout(() => this.renderBlocks(), 100);
            } else {
                this.setState({status: 'unavailable'});
            }
            return;
        }

        const xmls = this.getBlockXmls();
        if (xmls.length === 0) {
            this.setState({status: 'empty'});
            return;
        }

        // Capture the real editor workspace BEFORE injecting. `inject` overwrites
        // Blockly.mainWorkspace, so we restore it right after the workspace opens.
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
            const config = defaultsDeep({}, PREVIEW_OPTIONS, {rtl: this.props.isRtl}, {media});
            this.workspace = ScratchBlocks.inject(this.containerRef.current, config);
            ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

            // Restore the editor's main workspace immediately so it stays usable.
            if (realMain) {
                try {
                    ScratchBlocks.mainWorkspace = realMain;
                } catch (e) {
                    // ignore
                }
            }

            const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${xmls.join('')}</xml>`;
            ScratchBlocks.Xml.domToWorkspace(ScratchBlocks.Xml.textToDom(xml), this.workspace);

            // If nothing actually rendered (bad XML, etc.), show an empty state
            // instead of a blank workspace that looks broken.
            if (this.workspace.getAllBlocks().length === 0) {
                this.disposeWorkspace();
                this.setState({status: 'empty'});
                return;
            }

            // Stack the top-level blocks vertically so they don't overlap.
            const topBlocks = this.workspace.getTopBlocks(true);
            let y = 0;
            topBlocks.forEach(block => {
                block.moveBy(0, y);
                const size = (block.getHeightWidth && block.getHeightWidth()) || {height: 44};
                y += size.height + 16;
            });
            this.workspace.scrollCenter();
            this.setState({status: 'ok'});
            // Make sure Blockly recomputes the workspace size now that the
            // (previously hidden) container is visible.
            setTimeout(() => {
                if (this.workspace && this.workspace.resize) {
                    try {
                        this.workspace.resize();
                    } catch (e) {
                        // ignore resize errors
                    }
                }
            }, 0);
        } catch (e) {
            this.disposeWorkspace();
            this.setState({status: 'unavailable'});
        }
    }

    render () {
        const intl = this.props.intl;
        const status = this.state.status;

        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onClose}
                contentLabel={intl.formatMessage(messages.title)}
                id="extensionBlocksModal"
            >
                <Box className={styles.body}>
                    <h2 className={styles.title}>
                        {this.props.extensionName || intl.formatMessage(messages.title)}
                    </h2>
                    <div className={styles.workspaceWrapper}>
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
                    <div className={styles.buttonRow}>
                        <button
                            className={styles.closeButton}
                            onClick={this.props.onClose}
                        >
                            {intl.formatMessage(messages.close)}
                        </button>
                    </div>
                </Box>
            </Modal>
        );
    }
}

ExtensionBlocksModal.propTypes = {
    intl: intlShape,
    blocks: PropTypes.array, // eslint-disable-line react/forbid-prop-types
    extensionId: PropTypes.string,
    extensionName: PropTypes.string,
    isRtl: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

export default injectIntl(ExtensionBlocksModal);
