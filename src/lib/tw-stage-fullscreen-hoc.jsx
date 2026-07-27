import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';

import FullscreenAPI from './tw-fullscreen-api';
import {setFullScreen} from '../reducers/mode.js';
import TWBlocklyOutlineCleaner from './tw-blockly-outline-cleaner';

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
            // tw: 启动「物理禁用 blockly / 舞台焦点蓝色矩形」的全局监听
            TWBlocklyOutlineCleaner.init();
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
            // tw: 只把「舞台容器」的原生全屏映射到 redux isFullScreen。
            // 浮动窗口（作品控制页）的原生全屏由 stage.jsx 自己用 windowRef 管理，
            // 不要让它误触发编辑器主舞台的 .full-screen（fixed 铺满），否则两者互相干扰。
            // 浏览器在 fullscreenchange 触发时，document.fullscreenElement 已是最终状态
            // （进入=元素，退出=null），无需 setTimeout 延迟、也不会误判，立即同步即可，
            // 保证进入/退出都精确对齐，避免 .full-screen 类残留撑破视口。
            const fsElement = document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullscreenElement;
            const stageTarget = (typeof document !== 'undefined') ?
                document.querySelector('[data-stage-fullscreen-target]') : null;
            const native = !!(fsElement && stageTarget &&
                (fsElement === stageTarget || stageTarget.contains(fsElement)));
            if (this.props.isFullScreen !== native) {
                this.props.onSetIsFullScreen(native);
            }
            // tw: 无论进入还是退出，都把积木工作区 / 舞台的焦点蓝色矩形立即清掉
            // （物理方案，直接设 inline style，优先级最高，不依赖脆弱的 CSS :global()）。
            TWBlocklyOutlineCleaner.clearNow();
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
