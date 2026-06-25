import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import StageHeader from '../../containers/stage-header.jsx';
import Stage from '../../containers/stage.jsx';
import Loader from '../loader/loader.jsx';

import styles from './stage-wrapper.css';

class StageWrapperComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleResizeStart',
            'handleResizeMove',
            'handleResizeEnd'
        ]);
        this.state = {
            customScale: null,
            customWidth: null,
            isResizing: false
        };
        this.resizeStartX = 0;
        this.resizeStartWidth = 0;
        this.defaultWidth = 480; // 默认舞台宽度（large 模式）
    }

    handleResizeStart (e) {
        e.preventDefault();
        e.stopPropagation();
        const stageWrapper = this.stageWrapperRef;
        const rect = stageWrapper.getBoundingClientRect();
        this.resizeStartX = e.clientX;
        this.resizeStartWidth = rect.width;
        // 记录当前的缩放比例，基于当前宽度反推
        // 默认 large 模式是 480px 宽
        const baseWidth = this.props.stageSize === 'small' ? 240 : 480;
        this.resizeStartScale = this.state.customScale || (rect.width - 0) / baseWidth; // 减去 padding？
        this.setState({isResizing: true});
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
    }

    handleResizeMove (e) {
        if (!this.state.isResizing) return;
        const deltaX = e.clientX - this.resizeStartX;
        let newWidth = this.resizeStartWidth + deltaX;
        // 最小宽度 240px，最大宽度 1200px
        newWidth = Math.max(200, Math.min(1200, newWidth));
        // 计算缩放比例
        const baseWidth = this.props.stageSize === 'small' ? 240 : 480;
        const scale = newWidth / baseWidth;
        this.setState({
            customWidth: newWidth,
            customScale: scale
        });
    }

    handleResizeEnd () {
        this.setState({isResizing: false});
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);
    }

    componentDidUpdate (prevProps) {
        // 当 stageSize 变化时，重置自定义缩放
        if (prevProps.stageSize !== this.props.stageSize) {
            this.setState({
                customScale: null,
                customWidth: null
            });
        }
    }

    setStageWrapperRef (ref) {
        this.stageWrapperRef = ref;
    }

    render () {
        const {
            isEmbedded,
            isFullScreen,
            isRtl,
            isRendererSupported,
            loading,
            stageSize,
            vm
        } = this.props;

        const wrapperStyle = {};
        const canvasWrapperStyle = {};
        
        if (this.state.customWidth && !isFullScreen && !isEmbedded) {
            wrapperStyle.width = `${this.state.customWidth}px`;
        }
        
        if (this.state.customScale && !isFullScreen && !isEmbedded) {
            canvasWrapperStyle.transform = `scale(${this.state.customScale})`;
            canvasWrapperStyle.transformOrigin = 'top left';
            // 调整 wrapper 的高度以适应缩放后的舞台
            // 根据 stageSize 确定默认高度
            const defaultHeight = stageSize === 'small' ? 180 : 360;
            wrapperStyle.height = `${defaultHeight * this.state.customScale + 44}px`; // +44 是 stage menu 的高度
        }

        return (
            <Box
                ref={ref => this.setStageWrapperRef(ref)}
                className={classNames(
                    styles.stageWrapper,
                    {
                        [styles.embedded]: isEmbedded,
                        [styles.fullScreen]: isFullScreen,
                        [styles.loading]: loading,
                        [styles.offsetControls]: !(isEmbedded || isFullScreen),
                        [styles.isResizing]: this.state.isResizing
                    }
                )}
                dir={isRtl ? 'rtl' : 'ltr'}
                style={wrapperStyle}
            >
                <Box className={styles.stageMenuWrapper}>
                    <StageHeader
                        stageSize={stageSize}
                        vm={vm}
                    />
                </Box>
                <Box 
                    className={styles.stageCanvasWrapper}
                    style={canvasWrapperStyle}
                >
                    {
                        isRendererSupported ?
                            <Stage
                                stageSize={stageSize}
                                vm={vm}
                            /> :
                            null
                    }
                </Box>
                {loading ? (
                    <Loader isFullScreen={isFullScreen} />
                ) : null}
                {!isFullScreen && !isEmbedded ? (
                    <div
                        className={styles.resizeHandle}
                        onMouseDown={this.handleResizeStart}
                        title="拖拽调整舞台大小"
                    />
                ) : null}
            </Box>
        );
    }
}

StageWrapperComponent.propTypes = {
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRendererSupported: PropTypes.bool.isRequired,
    isRtl: PropTypes.bool.isRequired,
    loading: PropTypes.bool,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default StageWrapperComponent;
