import classNames from 'classnames';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import ToggleButtons from '../toggle-buttons/toggle-buttons.jsx';
import Controls from '../../containers/controls.jsx';
import {getStageDimensions} from '../../lib/screen-utils';
import {STAGE_DISPLAY_SIZES, STAGE_SIZE_MODES} from '../../lib/layout-constants';

import fullScreenIcon from './icon--fullscreen.svg';
import unFullScreenIcon from './icon--unfullscreen.svg';
import largeStageIcon from '!../../lib/tw-recolor/build!./icon--large-stage.svg';
import smallStageIcon from '!../../lib/tw-recolor/build!./icon--small-stage.svg';
import fullStageIcon from '!../../lib/tw-recolor/build!./icon--full-stage.svg';
import settingsIcon from './icon--settings.svg';
import openEditorIcon from './icon--open-editor.svg';

import styles from './stage-header.css';

import FullscreenAPI from '../../lib/tw-fullscreen-api';

// tw: 在「用户手势内」对【舞台容器】请求原生全屏（F11 式，地址栏消失）。
// 必须在按钮 onClick 的同步任务里调用，否则会脱离手势上下文被浏览器以 NotAllowedError 拒绝。
// 全屏目标是带 data-stage-fullscreen-target 的 stage-wrapper（它只包住舞台 + 控制条，
// 积木编辑区在它外面），所以原生全屏时浏览器只让「舞台」铺满屏、积木天然不显示，
// 运行的是当前内存里的作品，不跳转、不重新加载，退出后所有未保存修改都保留。
// —— 注意：不要对 document 全屏，否则会变成「整编辑器全屏」，违背「只全屏舞台」。
const requestStageFullscreen = () => {
    if (typeof document === 'undefined') return;
    const target = document.querySelector('[data-stage-fullscreen-target]');
    if (!target) return;
    let p;
    if (target.requestFullscreen) {
        p = target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
        p = target.webkitRequestFullscreen();
    }
    // 用户拒绝/环境不支持时静默失败：redux isFullScreen 仍为真，由 CSS .full-screen 作为回退铺满，
    // 不要复位成「假全屏」导致全屏彻底消失。
    if (p && typeof p.catch === 'function') {
        p.catch(() => {});
    }
};

const messages = defineMessages({
    largeStageSizeMessage: {
        defaultMessage: 'Switch to large stage',
        description: 'Button to change stage size to large',
        id: 'gui.stageHeader.stageSizeLarge'
    },
    smallStageSizeMessage: {
        defaultMessage: 'Switch to small stage',
        description: 'Button to change stage size to small',
        id: 'gui.stageHeader.stageSizeSmall'
    },
    fullStageSizeMessage: {
        defaultMessage: 'Switch to full stage',
        description: 'Button to change stage size to its full size',
        id: 'tw.stageHeader.full'
    },
    fullScreenMessage: {
        defaultMessage: 'Enter full screen mode',
        description: 'Button to change stage size to full screen',
        id: 'gui.stageHeader.stageSizeFull'
    },
    unFullScreenMessage: {
        defaultMessage: 'Exit full screen mode',
        description: 'Button to get out of full screen mode',
        id: 'gui.stageHeader.stageSizeUnFull'
    },
    fullscreenControl: {
        defaultMessage: 'Full Screen Control',
        description: 'Button to enter/exit full screen mode',
        id: 'gui.stageHeader.fullscreenControl'
    },
    openSettingsMessage: {
        defaultMessage: 'Open advanced settings',
        description: 'Button to open advanced settings in embeds',
        id: 'tw.openAdvanced'
    },
    openEditorMessage: {
        defaultMessage: '在编辑器中打开',
        description: '按钮：在嵌入页面中打开完整的编辑器',
        id: 'tw.stageHeader.openEditor'
    }
});

// tw: 由当前 embed 页面的 URL 派生出对应的完整编辑器 URL
// 语义：别的网站用 iframe 嵌入“我们”的编辑器时，点此按钮直接打开“我们”的
// 完整编辑器。这里只把 embed 页换成 editor 页，并保留查询参数与 hash
// （包括 project_url 跨域项目 / hash 中指向其它站点的项目链接），
// 这样完整编辑器能继续使用 project_url 跨域加载作品。
const getEditorUrl = () => {
    const url = new URL(window.location.href);
    // /123/embed -> /123 （路径形式部署）
    url.pathname = url.pathname.replace(/\/embed\/?$/, '');
    // /embed.html -> /editor.html （根嵌入页形式部署，保留 ?project_url= 与 #项目ID）
    url.pathname = url.pathname.replace(/\/embed\.html$/, '/editor.html');
    return url.href;
};

const enableSettingsButton = new URLSearchParams(location.search).has('settings-button');

const StageHeaderComponent = function (props) {
    const {
        customStageSize,
        showFixedLargeSize,
        isFullScreen,
        isPlayerOnly,
        onKeyPress,
        onSetStageFullScreen,
        onSetStageUnFullScreen,
        onSetStageLarge,
        onSetStageSmall,
        onSetStageFull,
        onOpenSettings,
        isEmbedded,
        stageSize,
        stageSizeMode,
        vm,
        codeLocked
    } = props;

    let header = null;

    const stageDimensions = getStageDimensions(stageSize, customStageSize, isFullScreen || isEmbedded);

    if (isFullScreen || isEmbedded) {
        const settingsButton = isEmbedded && enableSettingsButton ? (
            <div className={classNames(styles.settingsButton, styles.unselectWrapper)}>
                <Button
                    className={styles.stageButton}
                    onClick={onOpenSettings}
                >
                    <img
                        alt={props.intl.formatMessage(messages.openSettingsMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={settingsIcon}
                        title={props.intl.formatMessage(messages.openSettingsMessage)}
                    />
                </Button>
            </div>
        ) : null;
        // tw: 嵌入页面中提供“前往编辑器打开”入口；代码锁定模式下隐藏
        const openEditorButton = isEmbedded && !codeLocked ? (
            <div className={classNames(styles.settingsButton, styles.unselectWrapper)}>
                <Button
                    className={styles.stageButton}
                    onClick={() => {
                        const url = getEditorUrl();
                        if (window.parent !== window) {
                            // 被别的网站用 iframe 嵌入时，新标签打开“我们”的编辑器，
                            // 跳出 iframe（否则编辑器检测到仍在 iframe 内会显示 InvalidEmbed）。
                            window.open(url, '_blank', 'noopener');
                        } else {
                            window.location.href = url;
                        }
                    }}
                >
                    <img
                        alt={props.intl.formatMessage(messages.openEditorMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={openEditorIcon}
                        title={props.intl.formatMessage(messages.openEditorMessage)}
                    />
                </Button>
            </div>
        ) : null;
        const fullscreenButton = isFullScreen ? (
            <div className={styles.unselectWrapper}>
                <Button
                    className={styles.stageButton}
                    onClick={onSetStageUnFullScreen}
                    onKeyPress={onKeyPress}
                >
                    <img
                        alt={props.intl.formatMessage(messages.unFullScreenMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={unFullScreenIcon}
                        title={props.intl.formatMessage(messages.fullscreenControl)}
                    />
                </Button>
            </div>
        ) : FullscreenAPI.available() ? (
            <div className={styles.unselectWrapper}>
                <Button
                    className={styles.stageButton}
                    onClick={e => {
                        requestStageFullscreen();
                        onSetStageFullScreen();
                    }}
                >
                    <img
                        alt={props.intl.formatMessage(messages.fullScreenMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={fullScreenIcon}
                        title={props.intl.formatMessage(messages.fullscreenControl)}
                    />
                </Button>
            </div>
        ) : null;
        header = (
            <Box
                className={classNames(styles.stageHeaderWrapperOverlay, {
                    [styles.embedded]: isEmbedded
                })}
            >
                <Box
                    className={styles.stageMenuWrapper}
                    style={{width: stageDimensions.width}}
                >
                    <Controls vm={vm} />
                    <div
                        className={styles.fullscreenButtonsRow}
                        key="fullscreen" // addons require the HTML element to be not be re-used by in-editor buttons
                    >
                        {openEditorButton}
                        {settingsButton}
                        {fullscreenButton}
                    </div>
                </Box>
            </Box>
        );
    } else {
        const stageControls =
            isPlayerOnly ? (
                []
            ) : (
                <div className={styles.stageSizeToggleGroup}>
                    <ToggleButtons
                        buttons={[
                            {
                                handleClick: onSetStageSmall,
                                icon: smallStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.small,
                                title: props.intl.formatMessage(messages.smallStageSizeMessage)
                            },
                            ...(showFixedLargeSize ? [
                                {
                                    handleClick: onSetStageLarge,
                                    icon: largeStageIcon,
                                    iconClassName: styles.stageButtonIcon,
                                    isSelected: stageSizeMode === STAGE_SIZE_MODES.large,
                                    title: props.intl.formatMessage(messages.largeStageSizeMessage)
                                }
                            ] : []),
                            {
                                handleClick: onSetStageFull,
                                icon: showFixedLargeSize ? fullStageIcon : largeStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.full,
                                title: props.intl.formatMessage(messages.fullStageSizeMessage)
                            }
                        ]}
                    />
                </div>
            );
        header = (
            <Box
                className={styles.stageHeaderWrapper}
                // + 2 px because the stage will have 2 pixels of border around it
                style={{minWidth: `${stageDimensions.width + 2}px`}}
            >
                <Box className={styles.stageMenuWrapper}>
                    <Controls
                        vm={vm}
                        isSmall={stageSizeMode === STAGE_SIZE_MODES.small}
                    />
                    <div
                        className={styles.stageSizeRow}
                        key="editor" // addons require the HTML element to be not be re-used by in-editor buttons
                    >
                        {stageControls}
                        <div>
                            <Button
                                className={styles.stageButton}
                                onClick={e => {
                                    requestStageFullscreen();
                                    onSetStageFullScreen();
                                }}
                            >
                                <img
                                    alt={props.intl.formatMessage(messages.fullStageSizeMessage)}
                                    className={styles.stageButtonIcon}
                                    draggable={false}
                                    src={fullScreenIcon}
                                    title={props.intl.formatMessage(messages.fullscreenControl)}
                                />
                            </Button>
                        </div>
                    </div>
                </Box>
            </Box>
        );
    }

    return header;
};

const mapStateToProps = state => ({
    // This is the button's mode, as opposed to the actual current state
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    // tw: 代码锁定模式 —— 为 true 时隐藏“在编辑器中打开”按钮
    codeLocked: state.scratchGui.tw.codeLocked
});

StageHeaderComponent.propTypes = {
    intl: intlShape,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    showFixedLargeSize: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isPlayerOnly: PropTypes.bool.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    onSetStageFullScreen: PropTypes.func.isRequired,
    onSetStageUnFullScreen: PropTypes.func.isRequired,
    onSetStageLarge: PropTypes.func.isRequired,
    onSetStageSmall: PropTypes.func.isRequired,
    onSetStageFull: PropTypes.func.isRequired,
    onOpenSettings: PropTypes.func.isRequired,
    isEmbedded: PropTypes.bool.isRequired,
    codeLocked: PropTypes.bool,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)),
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    vm: PropTypes.instanceOf(VM).isRequired
};

StageHeaderComponent.defaultProps = {
    stageSizeMode: STAGE_SIZE_MODES.large
};

export default injectIntl(connect(
    mapStateToProps
)(StageHeaderComponent));
