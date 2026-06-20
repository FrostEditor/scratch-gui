import PropTypes from 'prop-types';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames';
import { Icon } from '@blueprintjs/core'; // 使用 Blueprint 图标库

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

    // ===== 舞台窗口状态 =====
    const [isMinimized, setIsMinimized] = useState(false);
    const [windowPos, setWindowPos] = useState({ x: 100, y: 100 });
    const windowRef = useRef(null);
    const dragData = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });

    // ===== FPS 小窗口状态 =====
    const [fps, setFps] = useState(0);
    const [isFpsCollapsed, setIsFpsCollapsed] = useState(false);
    const [fpsPos, setFpsPos] = useState({ x: 20, y: 20 });
    const fpsRef = useRef(null);
    const fpsDragData = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
    const fpsTitleRef = useRef(null);
    const fpsBallRef = useRef(null);

    // ===== FPS 测量 =====
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

    // ===== 舞台尺寸 =====
    const stageDimensions = getStageDimensions(stageSize, customStageSize, isFullScreen);
    const minWidth = getMinWidth(stageSize);
    const transformStyle = stageDimensions.width < minWidth && !isFullScreen
        ? { transform: `translateX(${(minWidth - stageDimensions.width) / (isRtl ? -2 : 2)}px)` }
        : {};

    // ===== 舞台窗口拖拽（标题栏） =====
    useEffect(() => {
        const titleBar = document.querySelector('.stage-window-titlebar');
        if (!titleBar || !windowRef.current) return;

        const onDragStart = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            const rect = windowRef.current.getBoundingClientRect();
            const clientX = e.clientX || e.touches?.[0]?.clientX;
            const clientY = e.clientY || e.touches?.[0]?.clientY;
            if (clientX == null) return;
            dragData.current = {
                isDragging: true,
                offsetX: clientX - rect.left,
                offsetY: clientY - rect.top,
            };
            e.preventDefault();

            const onMove = (ev) => {
                if (!dragData.current.isDragging) return;
                const cx = ev.clientX || ev.touches?.[0]?.clientX;
                const cy = ev.clientY || ev.touches?.[0]?.clientY;
                if (cx == null) return;
                let newX = cx - dragData.current.offsetX;
                let newY = cy - dragData.current.offsetY;
                const winWidth = windowRef.current.offsetWidth;
                const winHeight = windowRef.current.offsetHeight;
                newX = Math.max(0, Math.min(newX, window.innerWidth - winWidth));
                newY = Math.max(0, Math.min(newY, window.innerHeight - winHeight));
                setWindowPos({ x: newX, y: newY });
            };

            const onUp = () => {
                dragData.current.isDragging = false;
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

        titleBar.addEventListener('mousedown', onDragStart);
        titleBar.addEventListener('touchstart', onDragStart, { passive: false });

        return () => {
            titleBar.removeEventListener('mousedown', onDragStart);
            titleBar.removeEventListener('touchstart', onDragStart);
        };
    }, []);

    // ===== FPS 小窗口拖拽 =====
    useEffect(() => {
        const target = isFpsCollapsed ? fpsBallRef.current : fpsTitleRef.current;
        if (!target || !fpsRef.current) return;

        const container = fpsRef.current.parentElement;
        if (!container) return;

        const onFpsDragStart = (e) => {
            if (isFpsCollapsed) return;
            e.preventDefault();
            const rect = fpsRef.current.getBoundingClientRect();
            const clientX = e.clientX || e.touches?.[0]?.clientX;
            const clientY = e.clientY || e.touches?.[0]?.clientY;
            if (clientX == null) return;
            fpsDragData.current = {
                isDragging: true,
                offsetX: clientX - rect.left,
                offsetY: clientY - rect.top,
            };

            const onMove = (ev) => {
                if (!fpsDragData.current.isDragging) return;
                const cx = ev.clientX || ev.touches?.[0]?.clientX;
                const cy = ev.clientY || ev.touches?.[0]?.clientY;
                if (cx == null) return;
                const containerRect = container.getBoundingClientRect();
                const winWidth = fpsRef.current.offsetWidth;
                const winHeight = fpsRef.current.offsetHeight;
                let newX = cx - containerRect.left - fpsDragData.current.offsetX;
                let newY = cy - containerRect.top - fpsDragData.current.offsetY;
                const maxX = Math.max(0, containerRect.width - winWidth);
                const maxY = Math.max(0, containerRect.height - winHeight);
                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));
                setFpsPos({ x: newX, y: newY });
            };

            const onUp = () => {
                fpsDragData.current.isDragging = false;
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

        target.addEventListener('mousedown', onFpsDragStart);
        target.addEventListener('touchstart', onFpsDragStart, { passive: false });

        return () => {
            target.removeEventListener('mousedown', onFpsDragStart);
            target.removeEventListener('touchstart', onFpsDragStart);
        };
    }, [isFpsCollapsed]);

    // ===== 切换舞台最小化 =====
    const toggleMinimize = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

    // ===== 切换 FPS 折叠 =====
    const toggleFpsCollapse = useCallback(() => {
        setIsFpsCollapsed(prev => !prev);
    }, []);

    // ===== 舞台原有内容（含 FPS 小窗口） =====
    const stageContent = (
        <>
            <Box
                className={classNames(
                    styles.stageWrapper,
                    {[styles.withColorPicker]: !isFullScreen && isColorPicking}
                )}
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

                {/* ===== stageOverlays（包含 FPS 小窗口） ===== */}
                <Box
                    className={classNames(styles.stageOverlays, { [styles.fullScreen]: isFullScreen })}
                    style={{
                        position: 'relative',
                        ...transformStyle
                    }}
                >
                    {/* ===== FPS 小窗口 ===== */}
                    <div
                        ref={fpsRef}
                        style={{
                            position: 'absolute',
                            left: fpsPos.x,
                            top: fpsPos.y,
                            zIndex: 9999,
                            userSelect: 'none',
                            fontFamily: 'Segoe UI, sans-serif',
                            pointerEvents: 'auto',
                            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: isFpsCollapsed ? 'scale(0.7)' : 'scale(1)',
                            opacity: 1,
                        }}
                    >
                        {isFpsCollapsed ? (
                            // 折叠：圆形悬浮球
                            <div
                                ref={fpsBallRef}
                                onClick={toggleFpsCollapse}
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
                                title="展开 FPS"
                            >
                                {fps}
                            </div>
                        ) : (
                            // 展开：完整窗口
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
                                    ref={fpsTitleRef}
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
                                    <span><Icon icon="timeline-area-chart" /> FPS</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsFpsCollapsed(true);
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
                                        title="折叠"
                                    >
                                        <Icon icon="minus" />
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

                    {/* ===== 原有底部内容 ===== */}
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
        </>
    );

    // ===== 渲染舞台窗口（含标题栏和内容，带展开/折叠动画） =====
    return (
        <div
            ref={windowRef}
            style={{
                position: 'fixed',
                left: windowPos.x,
                top: windowPos.y,
                zIndex: 10000,
                backgroundColor: '#2a2a2a',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                overflow: 'hidden',
                height: isMinimized ? '36px' : 'auto',
                transition: 'height 0.3s ease',
                width: isMinimized ? 'auto' : stageDimensions.width + 2,
                minWidth: isMinimized ? '200px' : 'auto',
                pointerEvents: 'auto',
                border: '1px solid rgba(255,255,255,0.1)',
            }}
        >
            {/* 标题栏 */}
            <div
                className="stage-window-titlebar"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 12px',
                    height: '36px',
                    backgroundColor: 'rgba(40,40,40,0.9)',
                    borderBottom: isMinimized ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    cursor: 'grab',
                    userSelect: 'none',
                    color: '#ddd',
                    fontSize: '14px',
                    fontWeight: 500,
                    fontFamily: 'Segoe UI, sans-serif',
                }}
            >
                <span><Icon icon="applications" /> 舞台</span>
                <button
                    onClick={toggleMinimize}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#aaa',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '0 6px',
                        lineHeight: 1,
                    }}
                    title={isMinimized ? '展开舞台' : '最小化舞台'}
                >
                    {isMinimized ? <Icon icon="maximize" /> : <Icon icon="minimize" />}
                </button>
            </div>

            {/* 舞台内容区域（最小化时隐藏，带淡入淡出 + 高度动画） */}
            <div
                style={{
                    display: isMinimized ? 'none' : 'block',
                    opacity: isMinimized ? 0 : 1,
                    maxHeight: isMinimized ? 0 : '10000px',
                    transition: 'opacity 0.3s ease, max-height 0.3s ease',
                    overflow: 'hidden',
                }}
            >
                {stageContent}
            </div>
        </div>
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
