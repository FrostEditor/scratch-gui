import PropTypes from 'prop-types';
import React, { useState, useEffect, useRef, useCallback } from 'react'; // [FPS Window] 新增 useRef, useCallback
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

    // ===== [FPS Window] 状态管理 =====
    const [fps, setFps] = useState(0);
    const [isVisible, setIsVisible] = useState(true);      // 窗口是否显示
    const [position, setPosition] = useState({ x: 20, y: 20 }); // 窗口左上角相对 stageOverlays 的位置

    // 拖拽相关 refs
    const dragRefLocal = useRef(null);        // 窗口根元素
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // ===== FPS 测量 (不变) =====
    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let rafId = null;

        const measureFPS = () => {
            const now = performance.now();
            frameCount++;
            if (now - lastTime >= 1000) {
                setFps(frameCount);
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(measureFPS);
        };
        measureFPS();

        return () => cancelAnimationFrame(rafId);
    }, []);

    // ===== 拖拽事件处理 =====
    const onMouseDown = useCallback((e) => {
        // 只允许通过标题栏拖拽
        if (!e.target.closest('.fps-window-title')) return;
        isDragging.current = true;
        const rect = dragRefLocal.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        // 防止选中文本
        e.preventDefault();
    }, []);

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isDragging.current) return;
            // 计算新位置（相对于 stageOverlays 容器）
            const container = dragRefLocal.current.parentElement;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();
            let newX = e.clientX - containerRect.left - dragOffset.current.x;
            let newY = e.clientY - containerRect.top - dragOffset.current.y;
            // 边界限制（防止拖出视野）
            const winWidth = dragRefLocal.current.offsetWidth;
            const winHeight = dragRefLocal.current.offsetHeight;
            newX = Math.max(0, Math.min(newX, containerRect.width - winWidth));
            newY = Math.max(0, Math.min(newY, containerRect.height - winHeight));
            setPosition({ x: newX, y: newY });
        };

        const onMouseUp = () => {
            isDragging.current = false;
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    // ===== 窗口切换 =====
    const toggleVisibility = useCallback(() => {
        setIsVisible(prev => !prev);
    }, []);

    // ===== 舞台尺寸计算 (不变) =====
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

                {/* ===== stageOverlays 区域 ===== */}
                <Box
                    className={classNames(
                        styles.stageOverlays,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                    style={transformStyle}
                >
                    {/* ===== [FPS Window] 浮动窗口 ===== */}
                    {isVisible && (
                        <div
                            ref={dragRefLocal}
                            onMouseDown={onMouseDown}
                            style={{
                                position: 'absolute',
                                left: position.x,
                                top: position.y,
                                width: '160px',
                                backgroundColor: 'rgba(30, 30, 30, 0.85)',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                backdropFilter: 'blur(4px)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                zIndex: 9999,
                                userSelect: 'none',
                                fontFamily: 'Segoe UI, sans-serif',
                                cursor: 'default'
                            }}
                        >
                            {/* 标题栏 */}
                            <div
                                className="fps-window-title"
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
                                    fontWeight: 600
                                }}
                            >
                                <span>📊 FPS</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsVisible(false);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#aaa',
                                        fontSize: '16px',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        lineHeight: 1
                                    }}
                                    title="隐藏窗口"
                                >
                                    ✕
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
                                    textShadow: '0 0 8px rgba(0,255,0,0.3)'
                                }}
                            >
                                {fps}
                                <span style={{ fontSize: '14px', color: '#888', marginLeft: '6px' }}>fps</span>
                            </div>
                        </div>
                    )}

                    {/* [FPS Window] 当窗口隐藏时，显示一个小的显示按钮（浮动） */}
                    {!isVisible && (
                        <div
                            onClick={toggleVisibility}
                            style={{
                                position: 'absolute',
                                bottom: '20px',
                                right: '20px',
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                color: '#0f0',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                zIndex: 9999,
                                fontFamily: 'monospace',
                                border: '1px solid rgba(0,255,0,0.2)',
                                backdropFilter: 'blur(4px)',
                                userSelect: 'none'
                            }}
                        >
                            📊 FPS
                        </div>
                    )}

                    {/* 原有内容：stageBottomWrapper 等保持不变 */}
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
