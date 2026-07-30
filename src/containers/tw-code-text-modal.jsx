import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, intlShape} from 'react-intl';

import {MODES, serializeByMode, applyByMode} from '../lib/tw-code-text.js';
import styles from './tw-code-text-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: '代码文本编辑',
        description: 'Title of code-text editor modal',
        id: 'tw.codeText.title'
    },
    apply: {
        defaultMessage: '应用',
        description: 'Apply button',
        id: 'tw.codeText.apply'
    },
    cancel: {
        defaultMessage: '取消',
        description: 'Cancel button',
        id: 'tw.codeText.cancel'
    },
    copy: {
        defaultMessage: '复制',
        description: 'Copy button',
        id: 'tw.codeText.copy'
    },
    errorTitle: {
        defaultMessage: '无法应用，请检查文本：',
        description: 'Error prefix',
        id: 'tw.codeText.error'
    }
});

class CodeTextModal extends React.Component {
    constructor (props) {
        super(props);
        let initial = '';
        try {
            initial = serializeByMode(props.vm, props.mode) || '';
        } catch (e) {
            initial = '';
        }
        this.state = {
            text: initial,
            error: null
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleApply = this.handleApply.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
    }

    handleChange (e) {
        this.setState({text: e.target.value, error: null});
    }

    handleApply () {
        const {vm, mode, onClose, intl} = this.props;
        const errPrefix = intl ? intl.formatMessage(messages.errorTitle) : '无法应用，请检查文本：';
        try {
            applyByMode(vm, mode, this.state.text);
            this.setState({error: null});
            if (onClose) onClose();
        } catch (e) {
            this.setState({
                error: errPrefix + ' ' + (e && e.message ? e.message : String(e))
            });
        }
    }

    handleCopy () {
        try {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(this.state.text);
            }
        } catch (e) { /* ignore */ }
    }

    render () {
        const {mode, onClose, intl} = this.props;
        const meta = MODES[mode] || {label: mode, hint: ''};
        const t = (msg) => (intl ? intl.formatMessage(msg) : msg.defaultMessage);
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <div className={styles.header}>
                        <span className={styles.title}>
                            {t(messages.title)} · {meta.label}
                        </span>
                        <button
                            className={styles.closeBtn}
                            onClick={onClose}
                            title="关闭"
                        >
                            ×
                        </button>
                    </div>
                    <div className={styles.hint}>{meta.hint}</div>
                    <textarea
                        className={styles.textarea}
                        spellCheck={false}
                        value={this.state.text}
                        onChange={this.handleChange}
                    />
                    {this.state.error && (
                        <div className={styles.error}>{this.state.error}</div>
                    )}
                    <div className={styles.footer}>
                        <button
                            className={styles.copyBtn}
                            onClick={this.handleCopy}
                        >
                            {t(messages.copy)}
                        </button>
                        <div className={styles.spacer} />
                        <button
                            className={styles.cancelBtn}
                            onClick={onClose}
                        >
                            {t(messages.cancel)}
                        </button>
                        <button
                            className={styles.applyBtn}
                            onClick={this.handleApply}
                        >
                            {t(messages.apply)}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

CodeTextModal.propTypes = {
    vm: PropTypes.object,
    mode: PropTypes.oneOf(['code', 'costume', 'sound', 'notes']).isRequired,
    onClose: PropTypes.func,
    intl: intlShape
};

export default CodeTextModal;
