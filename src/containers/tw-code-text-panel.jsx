import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {MODES, serializeByMode, applyByMode} from '../lib/tw-code-text';
import styles from './tw-code-text-modal.css';

const messages = defineMessages({
    apply: {
        defaultMessage: '应用',
        description: 'Apply button',
        id: 'tw.codeText.apply'
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

/**
 * 「代码文本编辑」标签页内容（区别于弹窗 CodeTextModal）。
 * 把当前 sprite / 作品的图形化积木反编译成可读文本代码，可编辑后写回。
 * 复用 tw-code-text-modal.css 的样式，保证有 CSS。
 */
class CodeTextPanel extends React.Component {
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
        const {vm, mode, intl} = this.props;
        const errPrefix = intl ? intl.formatMessage(messages.errorTitle) : '无法应用，请检查文本：';
        try {
            applyByMode(vm, mode, this.state.text);
            this.setState({error: null});
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
        const {mode, intl} = this.props;
        const meta = MODES[mode] || {label: mode, hint: ''};
        const t = (msg) => (intl ? intl.formatMessage(msg) : msg.defaultMessage);
        return (
            <div className={styles.panel}>
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
                        className={styles.applyBtn}
                        onClick={this.handleApply}
                    >
                        {t(messages.apply)}
                    </button>
                </div>
            </div>
        );
    }
}

CodeTextPanel.propTypes = {
    vm: PropTypes.object,
    mode: PropTypes.string.isRequired,
    intl: intlShape
};

export default injectIntl(CodeTextPanel);
