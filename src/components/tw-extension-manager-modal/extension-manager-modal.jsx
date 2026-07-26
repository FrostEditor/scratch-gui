import {defineMessages, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useState} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import ExtensionBlocksModal from '../tw-extension-blocks-modal/extension-blocks-modal.jsx';
import styles from './extension-manager-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: 'Extension Manager',
        description: 'Title of extension manager modal',
        id: 'tw.extensionManager.title'
    },
    noExtensions: {
        defaultMessage: 'No extensions loaded',
        description: 'Message when no extensions are loaded',
        id: 'tw.extensionManager.noExtensions'
    },
    remove: {
        defaultMessage: 'Remove',
        description: 'Button to remove an extension',
        id: 'tw.extensionManager.remove'
    },
    close: {
        defaultMessage: 'Close',
        description: 'Button to close the modal',
        id: 'tw.extensionManager.close'
    },
    blocks: {
        defaultMessage: 'Blocks',
        description: 'Label for blocks count',
        id: 'tw.extensionManager.blocks'
    },
    showBlocks: {
        defaultMessage: 'Show blocks',
        description: 'Button to show blocks of an extension',
        id: 'tw.extensionManager.showBlocks'
    },
    hideBlocks: {
        defaultMessage: 'Hide blocks',
        description: 'Button to hide blocks of an extension',
        id: 'tw.extensionManager.hideBlocks'
    }
});

const ExtensionItem = ({ extension, onRemove, intl, vm }) => {
    const [previewOpen, setPreviewOpen] = useState(false);

    return (
        <div className={styles.extensionItem}>
            <div className={styles.extensionHeader}>
                <div className={styles.extensionInfo} onClick={() => setPreviewOpen(true)}>
                    {extension.iconURL && (
                        <img
                            src={extension.iconURL}
                            alt={extension.name}
                            className={styles.extensionIcon}
                        />
                    )}
                    <div className={styles.extensionDetails}>
                        <div className={styles.extensionName}>
                            {extension.name || extension.id}
                        </div>
                        {extension.description && (
                            <div className={styles.extensionDescription}>
                                {extension.description}
                            </div>
                        )}
                        <div className={styles.extensionMeta}>
                            {intl.formatMessage(messages.blocks)}: {extension.blocks ? extension.blocks.length : 0}
                            <span className={styles.toggleText}>
                                {intl.formatMessage(messages.showBlocks)}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    className={styles.removeButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(extension.id);
                    }}
                >
                    {intl.formatMessage(messages.remove)}
                </button>
            </div>

            {previewOpen && (
                <ExtensionBlocksModal
                    vm={vm}
                    extensionId={extension.id}
                    blocks={extension.blocks}
                    extensionName={extension.name || extension.id}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </div>
    );
};

ExtensionItem.propTypes = {
    extension: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        description: PropTypes.string,
        iconURL: PropTypes.string,
        blocks: PropTypes.array
    }).isRequired,
    onRemove: PropTypes.func.isRequired,
    intl: intlShape.isRequired,
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

const ExtensionManagerModal = props => (
    <Modal
        className={styles.modalContent}
        onRequestClose={props.onClose}
        contentLabel={props.intl.formatMessage(messages.title)}
        id="extensionManagerModal"
    >
        <Box className={styles.body}>
            <h2 className={styles.title}>
                {props.intl.formatMessage(messages.title)}
            </h2>
            
            <div className={styles.extensionList}>
                {props.extensions.length === 0 ? (
                    <p className={styles.noExtensions}>
                        {props.intl.formatMessage(messages.noExtensions)}
                    </p>
                ) : (
                    props.extensions.map((extension, index) => (
                        <ExtensionItem
                            key={index}
                            extension={extension}
                            onRemove={props.onRemoveExtension}
                            intl={props.intl}
                            vm={props.vm}
                        />
                    ))
                )}
            </div>

            <div className={styles.buttonRow}>
                <button
                    className={styles.closeButton}
                    onClick={props.onClose}
                >
                    {props.intl.formatMessage(messages.close)}
                </button>
            </div>
        </Box>
    </Modal>
);

ExtensionManagerModal.propTypes = {
    intl: intlShape,
    extensions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        description: PropTypes.string,
        iconURL: PropTypes.string,
        blocks: PropTypes.array
    })).isRequired,
    onRemoveExtension: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

export default injectIntl(ExtensionManagerModal);
