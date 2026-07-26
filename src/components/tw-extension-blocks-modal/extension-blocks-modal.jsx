import {defineMessages, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import styles from './extension-blocks-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Extension Blocks',
        description: 'Title of the extension blocks preview modal',
        id: 'tw.extensionBlocks.title'
    },
    empty: {
        defaultMessage: 'No blocks were found for this extension.',
        description: 'Shown when the extension has no blocks to display',
        id: 'tw.extensionBlocks.empty'
    },
    notReady: {
        defaultMessage: 'The block renderer is still loading. Please try again in a moment.',
        description: 'Shown when scratch-blocks is not ready yet',
        id: 'tw.extensionBlocks.notReady'
    },
    loading: {
        defaultMessage: 'Loading blocks…',
        description: 'Shown while blocks are being prepared',
        id: 'tw.extensionBlocks.loading'
    },
    close: {
        defaultMessage: 'Close',
        description: 'Button to close the modal',
        id: 'tw.extensionBlocks.close'
    }
});

class ExtensionBlocksModal extends React.Component {
    constructor (props) {
        super(props);
        this.containerRef = React.createRef();
        this.workspace = null;
        this.state = {
            status: 'loading' // loading | ok | empty | notReady
        };
    }

    componentDidMount () {
        this.renderBlocks();
    }

    componentWillUnmount () {
        if (this.workspace) {
            try {
                this.workspace.dispose();
            } catch (e) {
                // ignore disposal errors
            }
            this.workspace = null;
        }
    }

    renderBlocks () {
        const Blockly = (typeof window !== 'undefined') ? window.Blockly : null;
        if (!Blockly) {
            this.setState({status: 'notReady'});
            return;
        }

        const runtime = this.props.vm && this.props.vm.runtime;
        if (!runtime || !runtime._blockInfo) {
            this.setState({status: 'empty'});
            return;
        }

        const categoryInfo = runtime._blockInfo.find(info => info.id === this.props.extensionId);
        if (!categoryInfo) {
            this.setState({status: 'empty'});
            return;
        }

        // Only keep real blocks (skip the "Open Documentation" button entry)
        const blockXmls = (categoryInfo.blocks || [])
            .filter(block => block && block.json && block.xml)
            .map(block => block.xml);

        try {
            this.workspace = Blockly.inject(this.containerRef.current, {
                readOnly: true,
                toolbox: '<xml></xml>',
                scrollbars: true,
                trashcan: false,
                zoom: {
                    controls: false,
                    wheel: false,
                    startScale: 0.85,
                    maxScale: 1,
                    minScale: 0.4
                },
                media: Blockly.media || 'https://blockly.build/static/media/'
            });

            if (blockXmls.length > 0) {
                const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${blockXmls.join('')}</xml>`;
                Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xml), this.workspace);
                // Lay the top-level blocks out vertically so they don't overlap.
                const topBlocks = this.workspace.getTopBlocks(true);
                let y = 0;
                topBlocks.forEach(block => {
                    block.moveBy(0, y);
                    const height = (block.getHeightWidth && block.getHeightWidth().height) || 44;
                    y += height + 16;
                });
                this.workspace.scrollCenter();
                this.setState({status: 'ok'});
            } else {
                this.setState({status: 'empty'});
            }
        } catch (e) {
            this.setState({status: 'empty'});
        }
    }

    render () {
        const intl = this.props.intl;
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
                            className={styles.workspaceContainer}
                            ref={this.containerRef}
                        />
                        {this.state.status !== 'ok' && (
                            <div className={styles.placeholder}>
                                {this.state.status === 'loading' && intl.formatMessage(messages.loading)}
                                {this.state.status === 'notReady' && intl.formatMessage(messages.notReady)}
                                {this.state.status === 'empty' && intl.formatMessage(messages.empty)}
                            </div>
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
    vm: PropTypes.object, // eslint-disable-line react/forbid-prop-types
    extensionId: PropTypes.string.isRequired,
    extensionName: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(ExtensionBlocksModal);
