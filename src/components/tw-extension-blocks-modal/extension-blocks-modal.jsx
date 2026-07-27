import {defineMessages, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import ExtensionBlocksPreview from '../tw-extension-blocks-preview/extension-blocks-preview.jsx';
import styles from './extension-blocks-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Extension Blocks',
        description: 'Title of the extension blocks preview modal',
        id: 'tw.extensionBlocks.title'
    },
    close: {
        defaultMessage: 'Close',
        description: 'Button to close the modal',
        id: 'tw.extensionBlocks.close'
    }
});

// 这个弹窗只负责「标题栏 + 关闭按钮 + 关闭交互」，
// 真正的积木渲染交给共享组件 ExtensionBlocksPreview（与独立页面复用同一套逻辑）。
const ExtensionBlocksModal = props => {
    const intl = props.intl;
    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={intl.formatMessage(messages.title)}
            id="extensionBlocksModal"
        >
            <Box className={styles.body}>
                <h2 className={styles.title}>
                    {props.extensionName || intl.formatMessage(messages.title)}
                </h2>
                <ExtensionBlocksPreview
                    vm={props.vm}
                    blocks={props.blocks}
                    extensionId={props.extensionId}
                    isRtl={props.isRtl}
                />
                <div className={styles.buttonRow}>
                    <button
                        className={styles.closeButton}
                        onClick={props.onClose}
                    >
                        {intl.formatMessage(messages.close)}
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

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
