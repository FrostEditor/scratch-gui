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

    // --- FPS 状态 ---
    const [fps, setFps] = useState(0);
    const [isCollapsed, setIsCollapsed] = useState(false); // true=折叠成小球, false=完整窗口
    const [position, setPosition] = useState({ x: 20, y: 20 });

    // --- 拖拽 refs ---
    const windowRef = useRef(null);
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // --- FPS 测量 ---
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

    // --- 统一的拖拽处理（鼠标 + 触摸） ---
    const startDrag = useCallback((e) => {
        // 只有点击标题栏或悬浮球时才可拖拽
        const target = e.target;
        if (!target.closest('.fps-draggable-area')) return;
        e.preventDefault(); // 防止选中文本

        const rect = windowRef.current.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        if (clientX == null) return;

        dragOffset.current = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        isDragging.current = true;
    }, []);

    useEffect(() => {
        const onMove = (e) => {
            if (!isDragging.current) return;
            const clientX = e.clientX || e.touches?.[0]?.clientX;
            const clientY = e.clientY || e.touches?.[0]?.clientY;
            if (clientX == null) return;

            const container = windowRef.current.parentElement;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();
            const winWidth = windowRef.current.offsetWidth;
            const winHeight = windowRef.current.offsetHeight;

            let newX = clientX - containerRect.left - dragOffset.current.x;
            let newY = clientY - containerRect.top - dragOffset.current.y;
            // 边界约束
            newX = Math.max(0, Math.min(newX, containerRect.width - winWidth));
            newY = Math.max(0, Math.min(newY, containerRect.height - winHeight));
            setPosition({ x: newX, y: newY });
        };

        const onEnd = () => {
            isDragging.current = false;
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, []);

    // --- 切换折叠/展开 ---
    const toggleCollapse = useCallback(() => {
        setIsCollapsed(prev => !prev);
    }, []);

    // --- 舞台尺寸 ---
    const stageDimensions = getStageDimensions(stageSize, customStageSize, isFullScreen);
    const minWidth = getMinWidth(stageSize);
    const transformStyle = stageDimensions.width < minWidth && !isFullScreen ? {
        transform: `translateX(${(minWidth - stageDimensions.width) / (isRtl ? -2 : 2)}px)`
    } : {};

    return (
        <React.Fragment>
            <Box
                className={classNames(
                    styles.stageWrapper,
                    {[styles.withColorPicker]: !isFullScreen && isColorPicking})}
                onDoubleClick={onDoubleClick}
                style={isPlayerOnly ? null : {
                    minWidth: `${minWidth + 2}px`
                }}
            >
                <Box
                    className={classNames(
                        styles.stage,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                    style={{
                        height: stageDimensions.height,
                        width: stageDimensions.width,
                        ...transformStyle
                    }}
                >
                    <DOMElementRenderer
                        domElement={canvas}
                        style={{
                            height: stageDimensions.height,
                            width: stageDimensions.width
                        }}
                        {...boxProps}
                    />
                    <Box className={styles.customOverlays}>
                        <DOMElementRenderer domElement={props.overlay} />
                    </Box>
                    <Box className={styles.monitorWrapper}>
                        <MonitorList
                            draggable={useEditorDragStyle}
                            stageSize={stageDimensions}
                        />
                    </Box>
                    <Box className={styles.frameWrapper}>
                        <TargetHighlight
                            className={styles.frame}
                            stageHeight={stageDimensions.height}
                            stageWidth={stageDimensions.width}
                        />
                    </Box>
                    {isColorPicking && colorInfo ? (
                        <Loupe colorInfo={colorInfo} />
                    ) : null}
                </Box>

                {/* ===== 舞台覆盖层 ===== */}
                <Box
                    className={classNames(
                        styles.stageOverlays,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                    style={transformStyle}
                >
                    {/* ===== FPS 浮动窗口 ===== */}
                    <div
                        ref={windowRef}
                        onMouseDown={startDrag}
                        onTouchStart={startDrag}
                        style={{
                            position: 'absolute',
                            left: position.x,
                            top: position.y,
                            zIndex: 9999,
                            userSelect: 'none',
                            fontFamily: 'Segoe UI, sans-serif',
                            cursor: 'default',
                            pointerEvents: 'auto', // 确保可以交互
                        }}
                    >
                        {isCollapsed ? (
                            // ----- 折叠状态：圆形悬浮球 -----
                            <div
                                className="fps-draggable-area"
                                onClick={toggleCollapse}
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    background: 'rgba(30,30,30,0.85)',
                                    backdropFilter: 'blur(4px)',
                                    border: '1px solid rgba(0,255,0,0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0f0',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    fontFamily: 'monospace',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    cursor: 'grab',
                                }}
                                title="展开FPS窗口"
                            >
                                {fps}
                            </div>
                        ) : (
                            // ----- 展开状态：完整窗口 -----
                            <div
                                style={{
                                    width: '160px',
                                    backgroundColor: 'rgba(30,30,30,0.85)',
                                    borderRadius: '6px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                    backdropFilter: 'blur(4px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    pointerEvents: 'auto',
                                }}
                            >
                                {/* 标题栏（可拖拽区域） */}
                                <div
                                    className="fps-draggable-area"
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '6px 10px',
                                        backgroundColor: 'rgba(0,0,0,0.3)',
                                        borderRadius: '6px 6px 0 0',
                                        cursor: 'grab',
                                        color: '#ccc',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                    }}
                                >
                                    <span>📊 FPS</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsCollapsed(true); // 折叠成小球
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#aaa',
                                            fontSize: '16px',
                                            cursor: 'pointer',
                                            padding: '0 4px',
                                            lineHeight: 1,
                                            pointerEvents: 'auto',
                                        }}
                                        title="最小化到悬浮球"
                                    >
                                        ➖
                                    </button>
                                </div>
                                {/* 内容 */}
                                <div
                                    style={{
                                        padding: '12px 10px',
                                        textAlign: 'center',
                                        color: '#0f0',
                                        fontFamily: 'monospace',
                                        fontSize: '24px',
                                        fontWeight: 'bold',
                                        letterSpacing: '1px',
                                        textShadow: '0 0 8px rgba(0,255,0,0.3)',
                                    }}
                                >
                                    {fps}
                                    <span style={{ fontSize: '14px', color: '#888', marginLeft: '6px' }}>fps</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ===== 原有内容 ===== */}
                    <div
                        className={styles.stageBottomWrapper}
                        style={{
                            width: stageDimensions.width,
                            height: stageDimensions.height
                        }}
                    >
                        {micIndicator ? (
                            <MicIndicator
                                className={styles.micIndicator}
                                stageSize={stageDimensions}
                            />
                        ) : null}
                        {question === null ? null : (
                            <div
                                className={styles.questionWrapper}
                                style={{width: stageDimensions.width}}
                            >
                                <Question
                                    question={question}
                                    onQuestionAnswered={onQuestionAnswered}
                                />
                            </div>
                        )}
                    </div>
                    <canvas
                        className={styles.draggingSprite}
                        height={0}
                        ref={dragRef}
                        width={0}
                    />
                </Box>
                {isStarted ? null : (
                    <GreenFlagOverlay
                        className={styles.greenFlagOverlay}
                        wrapperClass={styles.greenFlagOverlayWrapper}
                    />
                )}
            </Box>
            {isColorPicking ? (
                <Box
                    className={styles.colorPickerBackground}
                    onClick={onDeactivateColorPicker}
                />
            ) : null}
        </React.Fragment>
    );
};

StageComponent.propTypes = {
    canvas: PropTypes.instanceOf(Element).isRequired,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
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
    useEditorDragStyle: PropTypes.bool
};
StageComponent.defaultProps = {
    dragRef: () => {}
};
export default StageComponent;
