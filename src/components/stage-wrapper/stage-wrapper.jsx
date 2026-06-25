import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES, FIXED_WIDTH} from '../../lib/layout-constants.js';
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
            isResizing: false
        };
        this.resizeStartX = 0;
        this.resizeStartWidth = 0;
    }

    getBaseWidth () {
        const {stageSize} = this.props;
        if (stageSize === STAGE_DISPLAY_SIZES.small) {
            return FIXED_WIDTH * 0.5;
        }
        return FIXED_WIDTH; // large 模式
    }

    getBaseHeight () {
        return this.getBaseWidth() * 0.75; // 4:3 比例
    }

    handleResizeStart (e) {
        e.preventDefault();
        e.stopPropagation();
        const stageWrapper = this.stageWrapperRef;
        const rect = stageWrapper.getBoundingClientRect();
        this.resizeStartX = e.clientX;
        this.resizeStartWidth = rect.width;
        this.setState({isResizing: true});
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
    }

    handleResizeMove (e) {
        if (!this.state.isResizing) return;
        const deltaX = e.clientX - this.resizeStartX;
        let newWidth = this.resizeStartWidth + deltaX;
        // 最小宽度 200px，最大宽度 1200px
        newWidth = Math.max(200, Math.min(1200, newWidth));
        const baseWidth = this.getBaseWidth();
        const scale = newWidth / baseWidth;
        this.setState({customScale: scale});
    }

    handleResizeEnd () {
        this.setState({isResizing: false});
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);
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

        const baseWidth = this.getBaseWidth();
        const baseHeight = this.getBaseHeight();
        const scale = this.state.customScale || 1;

        const wrapperStyle = {};
        const canvasWrapperStyle = {};
        if (this.state.customScale && !isFullScreen && !isEmbedded) {
            wrapperStyle.width = `${baseWidth * scale + 2}px`; // +2 是边框
            canvasWrapperStyle.transform = `scale(${scale})`;
            canvasWrapperStyle.transformOrigin = 'top left';
            canvasWrapperStyle.width = `${baseWidth}px`;
            canvasWrapperStyle.height = `${baseHeight}px`;
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
                        [styles.isResizing]: this.state.isResizing,
                        [styles.customSize]: this.state.customScale && !isFullScreen && !isEmbedded
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
