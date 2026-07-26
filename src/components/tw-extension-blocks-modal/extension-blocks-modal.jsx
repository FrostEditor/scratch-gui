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
    close: {
        defaultMessage: 'Close',
        description: 'Button to close the modal',
        id: 'tw.extensionBlocks.close'
    }
});

// Scratch blockType values (scratch-vm/src/extension-support/block-type.js)
const SHAPE = {
    COMMAND: 'command',
    REPORTER: 'reporter',
    BOOLEAN: 'Boolean',
    HAT: 'hat',
    EVENT: 'event',
    CONDITIONAL: 'conditional',
    LOOP: 'loop'
};

// Choose readable text colour for the block background.
function textColorFor (hex) {
    if (!hex || typeof hex !== 'string' || hex[0] !== '#') return '#ffffff';
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return '#ffffff';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // perceived luminance
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#333333' : '#ffffff';
}

// Render a single argument descriptor into a React node.
function renderArg (arg, key) {
    if (!arg || typeof arg !== 'object') return null;
    switch (arg.type) {
    case 'field_dropdown': {
        const opts = arg.options || [];
        let value = '';
        if (opts.length) {
            const first = opts[0];
            value = Array.isArray(first) ? (first[1] != null ? first[1] : first[0]) : first;
        }
        return (
            <span
                key={key}
                className={`${styles.field} ${styles.fieldDropdown}`}
            >
                {String(value)}
                <span className={styles.caret}>▾</span>
            </span>
        );
    }
    case 'field_input':
    case 'field_number':
    case 'field_angle':
        return (
            <span
                key={key}
                className={`${styles.field} ${styles.fieldInput}`}
            >
                {arg.value !== undefined ? String(arg.value) : (arg.text || (arg.type === 'field_number' ? '0' : ''))}
            </span>
        );
    case 'field_color':
        return (
            <span
                key={key}
                className={`${styles.field} ${styles.fieldColor}`}
                style={{background: arg.color || '#ff0000'}}
            />
        );
    case 'field_variable':
        return (
            <span
                key={key}
                className={`${styles.field} ${styles.fieldVariable}`}
            >
                {arg.variable || arg.text || '变量'}
            </span>
        );
    case 'field_label':
        return (
            <span
                key={key}
                className={styles.fieldLabel}
            >
                {arg.text || ''}
            </span>
        );
    case 'field_image':
        return (
            <img
                key={key}
                className={styles.fieldImage}
                src={arg.src}
                width={arg.width || 24}
                height={arg.height || 24}
                alt="*"
            />
        );
    case 'input_value':
        return (
            <span
                key={key}
                className={`${styles.field} ${styles.fieldValue} ${arg.check ? styles.fieldValueBoolean : ''}`}
            />
        );
    case 'input_statement':
        // Substack placeholder — rendered as a nested indented region.
        return (
            <span
                key={key}
                className={styles.substackMarker}
            />
        );
    default:
        return null;
    }
}

// Render the message lines of a block into nodes, interleaving arguments.
function renderMessage (blockJSON) {
    const nodes = [];
    let lineIndex = 0;
    let hasSubstack = false;
    while (true) {
        const message = blockJSON[`message${lineIndex}`];
        const args = blockJSON[`args${lineIndex}`] || [];
        if (message === undefined) break;
        const parts = String(message).split(/(%\d+)/g);
        parts.forEach(part => {
            if (/^%\d+$/.test(part)) {
                const idx = parseInt(part.slice(1), 10) - 1;
                const arg = args[idx];
                if (arg && arg.type === 'input_statement') {
                    hasSubstack = true;
                } else {
                    nodes.push(renderArg(arg, `a${lineIndex}_${idx}`));
                }
            } else if (part) {
                nodes.push(<span key={`t${lineIndex}_${part}`}>{part}</span>);
            }
        });
        lineIndex++;
        if (lineIndex > 20) break; // safety
    }
    return {nodes, hasSubstack};
}

function BlockPreview ({block}) {
    const json = (block && block.json) || {};
    const info = (block && block.info) || {};
    const blockType = info.blockType;

    let shapeClass = styles.blockStack;
    if (blockType === SHAPE.REPORTER) shapeClass = styles.blockReporter;
    else if (blockType === SHAPE.BOOLEAN) shapeClass = styles.blockBoolean;
    else if (blockType === SHAPE.HAT || blockType === SHAPE.EVENT) shapeClass = styles.blockHat;

    const colour = json.colour || '#9c9c9c';
    const txt = textColorFor(colour);

    const {nodes, hasSubstack} = renderMessage(json);

    return (
        <div
            className={`${styles.block} ${shapeClass}`}
            style={{background: colour, color: txt}}
        >
            <div className={styles.blockBody}>
                {nodes}
            </div>
            {hasSubstack && (
                <div className={styles.substack}>
                    <div className={styles.substackInner} />
                </div>
            )}
        </div>
    );
}

BlockPreview.propTypes = {
    block: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

class ExtensionBlocksModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: (props.blocks && props.blocks.length) ? 'ok' : 'empty'
        };
    }

    render () {
        const intl = this.props.intl;
        // Only render real blocks (skip label / separator / menu entries that
        // have no block JSON).
        const blocks = (this.props.blocks || []).filter(b => b && b.json);
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
                        {blocks.length === 0 ? (
                            <div className={styles.placeholder}>
                                {intl.formatMessage(messages.empty)}
                            </div>
                        ) : (
                            <div className={styles.blocksContainer}>
                                {blocks.map((block, i) => (
                                    <BlockPreview
                                        key={block && block.info ? block.info.opcode || i : i}
                                        block={block}
                                    />
                                ))}
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
    blocks: PropTypes.array, // eslint-disable-line react/forbid-prop-types
    extensionName: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(ExtensionBlocksModal);
