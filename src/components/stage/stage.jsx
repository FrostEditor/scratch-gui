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

    // ===== 舞台窗口状态 =====
    const [isMinimized, setIsMinimized] = useState(false); // true 表示最小化（仅显示标题栏）
    const [windowPos, setWindowPos] = useState({ x: 100, y: 100 }); // 窗口左上角位置（相对视口）
    const windowRef = useRef(null);
    const dragData = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });

    // ===== 舞台尺寸（原有） =====
    const stageDimensions = getStageDimensions(stageSize, customStageSize, isFullScreen);
    const minWidth = getMinWidth(stageSize);
    const transformStyle = stageDimensions.width < minWidth && !isFullScreen
        ? { transform: `translateX(${(minWidth - stageDimensions.width) / (isRtl ? -2 : 2)}px)` }
        : {};

    // ===== 窗口拖拽逻辑（原生事件，只作用于标题栏） =====
    useEffect(() => {
        const titleBar = document.querySelector('.stage-window-titlebar');
        if (!titleBar || !windowRef.current) return;

        const onDragStart = (e) => {
            // 只允许鼠标左键或触摸
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

                // 边界约束（视口）
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
    }, []); // 只绑定一次

    // ===== 最小化切换 =====
    const toggleMinimize = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

    // ===== 窗口内容（舞台原有内容） =====
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

                {/* 原有 stageOverlays 内容（麦克风、问题等） */}
                <Box
                    className={classNames(styles.stageOverlays, { [styles.fullScreen]: isFullScreen })}
                    style={transformStyle}
                >
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
                // 最小化时高度只显示标题栏，否则为内容高度
                height: isMinimized ? '36px' : 'auto',
                transition: 'height 0.25s ease, width 0.25s ease',
                width: isMinimized ? 'auto' : stageDimensions.width + 2, // 加边框宽度
                minWidth: isMinimized ? '200px' : 'auto',
                resize: 'none',
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
                <span>🎬 舞台</span>
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
                    {isMinimized ? '⬆' : '➖'}
                </button>
            </div>

            {/* 舞台内容区域（最小化时隐藏） */}
            <div
                style={{
                    display: isMinimized ? 'none' : 'block',
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
