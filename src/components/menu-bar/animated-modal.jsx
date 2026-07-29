/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';

// 一次性注入全局动画样式（避免依赖 webpack 的 css-loader 配置）。
let styleInjected = false;
function injectStyles () {
    if (styleInjected || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.id = 'fe-animated-modal-styles';
    el.textContent = `
.fe-modal-overlay {
    transition: opacity 220ms ease;
}
.fe-modal-card {
    transition: opacity 280ms ease, transform 360ms cubic-bezier(0.34, 1.45, 0.5, 1);
    will-change: transform, opacity;
}
/* 卡片内部元素错落上浮，营造「灵动」进入感 */
.fe-modal-card > * {
    animation: fe-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.fe-modal-card > *:nth-child(1) { animation-delay: 30ms; }
.fe-modal-card > *:nth-child(2) { animation-delay: 70ms; }
.fe-modal-card > *:nth-child(3) { animation-delay: 110ms; }
.fe-modal-card > *:nth-child(4) { animation-delay: 150ms; }
.fe-modal-card > *:nth-child(5) { animation-delay: 190ms; }
.fe-modal-card > *:nth-child(n+6) { animation-delay: 220ms; }

@keyframes fe-rise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* 发布成功：打勾圆 + 文案弹跳 */
@keyframes fe-pop {
    0%   { transform: scale(0.5); opacity: 0; }
    55%  { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
.fe-success-pop {
    text-align: center;
    animation: fe-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.fe-success-check {
    width: 56px; height: 56px; margin: 0 auto 10px;
    border-radius: 50%; background: #1a7f37; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 30px; line-height: 1;
    animation: fe-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* 标签页切换时内容轻轻滑入 */
.fe-tab-fade { animation: fe-fade 260ms ease both; }
@keyframes fe-fade { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
    .fe-modal-overlay, .fe-modal-card, .fe-modal-card > *,
    .fe-success-pop, .fe-success-check, .fe-tab-fade {
        transition: none !important;
        animation: none !important;
    }
}
`;
    document.head.appendChild(el);
    styleInjected = true;
}

const ANIM_MS = 380; // 退场动画时长，需 >= CSS 中 overlay/card 的 transition 时长

class AnimatedModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {mounted: !!props.open, visible: false};
        this._timer = null;
        this._isMounted = false;
    }
    componentDidMount () {
        injectStyles();
        this._isMounted = true;
        if (this.props.open) this._enter();
    }
    componentDidUpdate (prev) {
        if (this.props.open && !prev.open) {
            clearTimeout(this._timer);
            if (!this.state.mounted) this.setState({mounted: true, visible: false});
            this._enter();
        } else if (!this.props.open && prev.open) {
            this.setState({visible: false});
            this._timer = setTimeout(() => {
                if (this._isMounted) this.setState({mounted: false});
            }, ANIM_MS);
        }
    }
    componentWillUnmount () {
        this._isMounted = false;
        clearTimeout(this._timer);
    }
    // 下一帧再切到可见态，确保浏览器从「初始隐藏态」开始计算 transition
    _enter () {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this._isMounted && this.props.open) this.setState({visible: true});
        }));
    }
    render () {
        if (!this.state.mounted) return null;
        const {overlay, card, onOverlayClick, children, cardStyle, overlayStyle} = this.props;
        return (
            <div
                className="fe-modal-overlay"
                style={{
                    ...overlay,
                    ...overlayStyle,
                    opacity: this.state.visible ? 1 : 0
                }}
                onMouseDown={onOverlayClick}
            >
                <div
                    className="fe-modal-card"
                    style={{
                        ...card,
                        ...cardStyle,
                        opacity: this.state.visible ? 1 : 0,
                        transform: this.state.visible
                            ? 'translateY(0) scale(1)'
                            : 'translateY(16px) scale(0.94)'
                    }}
                >
                    {children}
                </div>
            </div>
        );
    }
}

AnimatedModal.propTypes = {
    open: PropTypes.bool,
    overlay: PropTypes.object,
    card: PropTypes.object,
    onOverlayClick: PropTypes.func,
    children: PropTypes.node,
    cardStyle: PropTypes.object,
    overlayStyle: PropTypes.object
};

export default AnimatedModal;
