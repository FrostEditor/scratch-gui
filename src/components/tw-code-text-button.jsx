import React from 'react';
import PropTypes from 'prop-types';

/**
 * 矩形「代码文本编辑」按钮，复用于 代码 / 造型 / 声音 / 作品说明 各标签页。
 */
const CodeTextButton = ({onClick, label, style}) => (
    <button
        type="button"
        className="tw-code-text-edit-btn"
        onClick={onClick}
        title="以文本方式查看 / 编辑"
        style={style}
    >
        {label || '代码文本编辑'}
    </button>
);

CodeTextButton.propTypes = {
    onClick: PropTypes.func.isRequired,
    label: PropTypes.string,
    style: PropTypes.object
};

export default CodeTextButton;
