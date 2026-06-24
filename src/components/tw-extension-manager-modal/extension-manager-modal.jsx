import {defineMessages, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
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
    }
});

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
                        <div key={index} className={styles.extensionItem}>
                            <div className={styles.extensionInfo}>
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
                                </div>
                            </div>
                            <button
                                className={styles.removeButton}
                                onClick={() => props.onRemoveExtension(extension.id)}
                            >
                                {props.intl.formatMessage(messages.remove)}
                            </button>
                        </div>
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
        iconURL: PropTypes.string
    })).isRequired,
    onRemoveExtension: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(ExtensionManagerModal);
