import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {setFullScreen} from '../reducers/mode';
import {setIsWindowFullScreen} from '../reducers/tw';
import FullscreenAPI from './tw-fullscreen-api';

// tw: embed 页「原生全屏」HOC —— 策略与编辑器页 tw-stage-fullscreen-hoc 完全一致：
// 进入全屏由 stage-header 的全屏按钮在「用户手势内」直接调用
// stage-wrapper（data-stage-fullscreen-target）的 requestFullscreen() 完成（只全屏舞台，
// 不整页），本 HOC 不负责进入，否则会和按钮抢同一个全屏元素、把「只全屏舞台」变成「整页全屏」。
// 本 HOC 仅负责：
//   1) 原生全屏状态变化（如按 ESC 退出、或 iframe 内无 allowfullscreen 导致失败）时，
//      只把「舞台容器」的原生全屏同步回 redux 的 isFullScreen，让按钮/ CSS 回到正确态；
//   2) 当 redux isFullScreen 由按钮触发变为 false（点「退出全屏」）且当前确处原生全屏时，
//      exit() 真正退出原生全屏。
const TWFullScreenHOC = function (WrappedComponent) {
    class FullScreenComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleFullScreenChange'
            ]);
        }
        componentDidMount () {
            document.addEventListener('fullscreenchange', this.handleFullScreenChange);
            document.addEventListener('webkitfullscreenchange', this.handleFullScreenChange);
        }
        shouldComponentUpdate (nextProps) {
            return this.props.isFullScreen !== nextProps.isFullScreen;
        }
        componentDidUpdate (prevProps) {
            // 退出：redux isFullScreen 由 true 变 false（用户点了退出按钮），
            // 且当前确实处于原生全屏 → 退出原生全屏。进入不在这里处理（在按钮手势内完成）。
            if (!this.props.isFullScreen && prevProps.isFullScreen) {
                if (FullscreenAPI.enabled()) {
                    FullscreenAPI.exit();
                }
            }
        }
        componentWillUnmount () {
            document.removeEventListener('fullscreenchange', this.handleFullScreenChange);
            document.removeEventListener('webkitfullscreenchange', this.handleFullScreenChange);
        }
        handleFullScreenChange () {
            // 只把「舞台容器」的原生全屏映射到 redux isFullScreen：
            // 确认当前原生全屏元素就是 data-stage-fullscreen-target（或它的后代），
            // 避免把 body 等其它全屏误判成舞台全屏。
            const fsElement = document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullscreenElement;
            const stageTarget = (typeof document !== 'undefined') ?
                document.querySelector('[data-stage-fullscreen-target]') : null;
            const native = !!(fsElement && stageTarget &&
                (fsElement === stageTarget || stageTarget.contains(fsElement)));
            if (this.props.isFullScreen !== native) {
                this.props.onSetIsFullScreen(native);
                this.props.onSetWindowIsFullScreen(native);
            }
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                isFullScreen,
                onSetIsFullScreen,
                onSetWindowIsFullScreen,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    FullScreenComponent.propTypes = {
        isFullScreen: PropTypes.bool,
        onSetIsFullScreen: PropTypes.func,
        onSetWindowIsFullScreen: PropTypes.func
    };
    const mapStateToProps = state => ({
        isFullScreen: state.scratchGui.mode.isFullScreen
    });
    const mapDispatchToProps = dispatch => ({
        onSetIsFullScreen: isFullScreen => dispatch(setFullScreen(isFullScreen)),
        onSetWindowIsFullScreen: isFullScreen => dispatch(setIsWindowFullScreen(isFullScreen))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(FullScreenComponent);
};

export {
    TWFullScreenHOC as default
};
