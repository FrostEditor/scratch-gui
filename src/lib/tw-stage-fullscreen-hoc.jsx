import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';

import FullscreenAPI from './tw-fullscreen-api';
import {setFullScreen} from '../reducers/mode.js';

/**
 * tw: 编辑器页「原生 F11 式全屏」HOC
 *
 * 设计要点：
 * - 进入全屏由 stage-header 的全屏按钮在「用户手势内」直接调用元素的
 *   requestFullscreen() 完成（见 stage-header.jsx），本 HOC 不负责进入，
 *   以免脱离手势上下文被浏览器以 NotAllowedError 拒绝（这是之前「全屏没用」的根因）。
 * - 本 HOC 负责两件事：
 *   1) 浏览器原生全屏状态变化（如按 ESC 退出）时，把 redux 的 isFullScreen 同步回 false，
 *      让按钮、CSS 回到正常态。
 *   2) 当 redux isFullScreen 由按钮触发变为 false（用户点「退出全屏」）且当前正处于
 *      原生全屏时，调用 FullscreenAPI.exit() 真正退出原生全屏。
 *
 * 这样全屏的是「当前正在编辑的作品」（运行的是内存里的 VM），且退出后编辑器状态
 * 完整保留，不会丢失任何未保存的修改（不整页跳转、不重新加载）。
 */

const TWStageFullScreenHOC = function (WrappedComponent) {
    class StageFullScreenComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleFullScreenChange'
            ]);
        }
        componentDidMount () {
            if (typeof document !== 'undefined') {
                document.addEventListener('fullscreenchange', this.handleFullScreenChange);
                document.addEventListener('webkitfullscreenchange', this.handleFullScreenChange);
            }
        }
        componentDidUpdate (prevProps) {
            // 退出：redux isFullScreen 由 true 变 false（用户点了退出按钮），
            // 且当前确实处于原生全屏 → 退出原生全屏。
            // 进入不在这里处理（在按钮手势内完成）。
            if (!this.props.isFullScreen && prevProps.isFullScreen) {
                if (FullscreenAPI.enabled()) {
                    FullscreenAPI.exit();
                }
            }
        }
        componentWillUnmount () {
            if (typeof document !== 'undefined') {
                document.removeEventListener('fullscreenchange', this.handleFullScreenChange);
                document.removeEventListener('webkitfullscreenchange', this.handleFullScreenChange);
            }
        }
        handleFullScreenChange () {
            // 浏览器原生全屏状态变化（例如按 ESC 退出）。
            // 若已退出原生全屏但 redux 仍以为是全屏，则同步回 false。
            const isNativeFullScreen = FullscreenAPI.enabled();
            if (!isNativeFullScreen && this.props.isFullScreen) {
                this.props.onSetIsFullScreen(false);
            }
        }
        render () {
            return (
                <WrappedComponent {...this.props} />
            );
        }
    }
    StageFullScreenComponent.propTypes = {
        isFullScreen: PropTypes.bool,
        isEmbedded: PropTypes.bool,
        onSetIsFullScreen: PropTypes.func
    };
    const mapStateToProps = state => ({
        isFullScreen: state.scratchGui.mode.isFullScreen,
        isEmbedded: state.scratchGui.mode.isEmbedded
    });
    const mapDispatchToProps = dispatch => ({
        onSetIsFullScreen: fullscreen => dispatch(setFullScreen(fullscreen))
    });
    return connect(mapStateToProps, mapDispatchToProps)(StageFullScreenComponent);
};

export default TWStageFullScreenHOC;
