import PropTypes from 'prop-types';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames';

import Box from '../box/box.jsx';
import DOMElementRenderer from '../../containers/dom-element-renderer.jsx';
import Loupe from '../loupe/loupe.jsx';
import MonitorList from '../../containers/monitor-list.jsx';
import TargetHighlight from '../../containers/target-highlight.jsx';
import GreenFlagOverlay from '../../containers/green-flag-overlay.jsx';
import Question from '../../containers/question.jsx';
import MicIndicator from '../mic-indicator/mic-indicator.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import {getStageDimensions, getMinWidth} from '../../lib/screen-utils.js';
import styles from './stage.css';

const StageComponent = props => {
    const {
        canvas,
        customStageSize,
        dragRef,
        isColorPicking,
        isFullScreen,
        isPlayerOnly,
        isStarted,
        isRtl,
        colorInfo,
        micIndicator,
        question,
        stageSize,
        useEditorDragStyle,
        onDeactivateColorPicker,
        onDoubleClick,
        onQuestionAnswered,
        ...boxProps
    } = props;

    // 状态
    const [fps, setFps] = useState(0);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 20 });

    // refs
    const windowRef = useRef(null);
    const titleRef = useRef(null);
    const ballRef = useRef(null);
    const dragData = useRef({
        isDragging: false,
        offsetX: 0,
        offsetY: 0,
    });

    // FPS 测量
    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let rafId = null;
        const measure = () => {
            const now = performance.now();
            frameCount++;
            if (now - lastTime >= 1000) {
                setFps(frameCount);
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(measure);
        };
        measure();
        return () => cancelAnimationFrame(rafId);
    }, []);

    // 舞台尺寸
    const stageDimensions = getStageDimensions(stageSize, customStageSize, isFullScreen);
    const minWidth = getMinWidth(stageSize);
    const transformStyle = stageDimensions.width < minWidth && !isFullScreen
        ? { transform: `translateX(${(minWidth - stageDimensions.width) / (isRtl ? -2 : 2)}px)` }
        : {};

    // 折叠时的右下角坐标
    const collapsedX = stageDimensions.width - 56 - 20;
    const collapsedY = stageDimensions.height - 56 - 20;
    const currentPos = isCollapsed
        ? { x: collapsedX, y: collapsedY }
        : position;

    // --- 原生拖拽事件绑定 ---
    useEffect(() => {
        const targetElement = isCollapsed ? ballRef.current : titleRef.current;
        if (!targetElement || !windowRef.current) return;

        const container = windowRef.current.parentElement;
        if (!container) return;

        const onDragStart = (e) => {
            if (isCollapsed) return; // 折叠时不允许拖拽
            e.preventDefault();
            const rect = windowRef.current.getBoundingClientRect();
            const clientX = e.clientX || e.touches?.[0]?.clientX;
            const clientY = e.clientY || e.touches?.[0]?.clientY;
            if (clientX == null) return;

            dragData.current = {
                isDragging: true,
                offsetX: clientX - rect.left,
                offsetY: clientY - rect.top,
            };
            console.log('拖拽开始 (原生)');

            const onMove = (ev) => {
                if (!dragData.current.isDragging) return;
                const cx = ev.clientX || ev.touches?.[0]?.clientX;
                const cy = ev.clientY || ev.touches?.[0]?.clientY;
                if (cx == null) return;

                const containerRect = container.getBoundingClientRect();
                const winWidth = windowRef.current.offsetWidth;
                const winHeight = windowRef.current.offsetHeight;

                // 调试：打印容器和窗口尺寸
                console.log('容器尺寸:', containerRect.width, containerRect.height);
                console.log('窗口尺寸:', winWidth, winHeight);

                let newX = cx - containerRect.left - dragData.current.offsetX;
                let newY = cy - containerRect.top - dragData.current.offsetY;

                // 边界约束 – 允许在舞台内自由移动，若超出则 clamp
                const maxX = Math.max(0, containerRect.width - winWidth);
                const maxY = Math.max(0, containerRect.height - winHeight);
                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                console.log('新位置:', newX, newY);

                setPosition({ x: newX, y: newY });
            };

            const onUp = () => {
                dragData.current.isDragging = false;
                console.log('拖拽结束');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
        };

        targetElement.addEventListener('mousedown', onDragStart);
        targetElement.addEventListener('touchstart', onDragStart, { passive: false });

        return () => {
            targetElement.removeEventListener('mousedown', onDragStart);
            targetElement.removeEventListener('touchstart', onDragStart);
        };
    }, [isCollapsed]);

    // 切换折叠
    const toggleCollapse = useCallback(() => {
        setIsCollapsed(prev => !prev);
    }, []);

    return (
        <React.Fragment>
            <Box
                className={classNames(
                    styles.stageWrapper,
                    {[styles.withColorPicker]: !isFullScreen && isColorPicking})}
                onDoubleClick={onDoubleClick}
                style={isPlayerOnly ? null : { minWidth: `${minWidth + 2}px` }}
            >
                <Box
                    className={classNames(styles.stage, { [styles.fullScreen]: isFullScreen })}
                    style={{
                        height: stageDimensions.height,
                        width: stageDimensions.width,
                        ...transformStyle
                    }}
                >
                    <DOMElementRenderer domElement={canvas} style={{ height: stageDimensions.height, width: stageDimensions.width }} {...boxProps} />
                    <Box className={styles.customOverlays}>
                        <DOMElementRenderer domElement={props.overlay} />
                    </Box>
                    <Box className={styles.monitorWrapper}>
                        <MonitorList draggable={useEditorDragStyle} stageSize={stageDimensions} />
                    </Box>
                    <Box className={styles.frameWrapper}>
                        <TargetHighlight stageHeight={stageDimensions.height} stageWidth={stageDimensions.width} />
                    </Box>
                    {isColorPicking && colorInfo ? <Loupe colorInfo={colorInfo} /> : null}
                </Box>

                {/* stageOverlays – relative 定位 */}
                <Box
                    className={classNames(styles.stageOverlays, { [styles.fullScreen]: isFullScreen })}
                    style={{
                        position: 'relative',
                        ...transformStyle
                    }}
                >
                    {/* FPS 浮动窗口 */}
                    <div
                        ref={windowRef}
                        style={{
                            position: 'absolute',
                            left: currentPos.x,
                            top: currentPos.y,
                            zIndex: 9999,
                            userSelect: 'none',
                            fontFamily: 'Segoe UI, sans-serif',
                            pointerEvents: 'auto',
                            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: isCollapsed ? 'scale(0.7)' : 'scale(1)',
                            opacity: 1,
                        }}
                    >
                        {isCollapsed ? (
                            <div
                                ref={ballRef}
                                onClick={toggleCollapse}
                                style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    background: 'rgba(30,30,30,0.85)',
                                    backdropFilter: 'blur(4px)',
                                    border: '2px solid rgba(0,255,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0f0',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    fontFamily: 'monospace',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                    cursor: 'pointer',
                                    pointerEvents: 'auto',
                                }}
                                title="点击展开 FPS 窗口"
                            >
                                {fps}
                            </div>
                        ) : (
                            <div
                                style={{
                                    width: '160px',
                                    backgroundColor: 'rgba(30,30,30,0.85)',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(8px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    pointerEvents: 'auto',
                                }}
                            >
                                <div
                                    ref={titleRef}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 12px',
                                        backgroundColor: 'rgba(0,0,0,0.3)',
                                        borderRadius: '8px 8px 0 0',
                                        cursor: 'grab',
                                        color: '#ddd',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        userSelect: 'none',
                                        pointerEvents: 'auto',
                                    }}
                                >
                                    <span>📊 FPS</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsCollapsed(true);
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#aaa',
                                            fontSize: '18px',
                                            cursor: 'pointer',
                                            padding: '0 4px',
                                            lineHeight: 1,
                                            pointerEvents: 'auto',
                                        }}
                                        title="折叠到右下角"
                                    >
                                        ➖
                                    </button>
                                </div>
                                <div
                                    style={{
                                        padding: '14px 10px 16px',
                                        textAlign: 'center',
                                        color: '#0f0',
                                        fontFamily: 'monospace',
                                        fontSize: '28px',
                                        fontWeight: 'bold',
                                        letterSpacing: '1px',
                                        textShadow: '0 0 12px rgba(0,255,0,0.3)',
                                    }}
                                >
                                    {fps}
                                    <span style={{ fontSize: '14px', color: '#888', marginLeft: '6px' }}>fps</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 原有底部内容 */}
                    <div
                        className={styles.stageBottomWrapper}
                        style={{ width: stageDimensions.width, height: stageDimensions.height }}
                    >
                        {micIndicator ? <MicIndicator className={styles.micIndicator} stageSize={stageDimensions} /> : null}
                        {question === null ? null : (
                            <div className={styles.questionWrapper} style={{ width: stageDimensions.width }}>
                                <Question question={question} onQuestionAnswered={onQuestionAnswered} />
                            </div>
                        )}
                    </div>
                    <canvas className={styles.draggingSprite} height={0} ref={dragRef} width={0} />
                </Box>

                {isStarted ? null : (
                    <GreenFlagOverlay
                        className={styles.greenFlagOverlay}
                        wrapperClass={styles.greenFlagOverlayWrapper}
                    />
                )}
            </Box>
            {isColorPicking ? <Box className={styles.colorPickerBackground} onClick={onDeactivateColorPicker} /> : null}
        </React.Fragment>
    );
};

StageComponent.propTypes = {
    canvas: PropTypes.instanceOf(Element).isRequired,
    customStageSize: PropTypes.shape({ width: PropTypes.number, height: PropTypes.number }),
    overlay: PropTypes.instanceOf(Element).isRequired,
    colorInfo: Loupe.propTypes.colorInfo,
    dragRef: PropTypes.func,
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isStarted: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onDeactivateColorPicker: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onQuestionAnswered: PropTypes.func,
    question: PropTypes.string,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool,
};
StageComponent.defaultProps = { dragRef: () => {} };
export default StageComponent;
