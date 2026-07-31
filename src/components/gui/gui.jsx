import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import ProjectStatement from '../project-statement/project-statement.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import BrowserModal from '../browser-modal/browser-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import TWUsernameModal from '../../containers/tw-username-modal.jsx';
import TWSettingsModal from '../../containers/tw-settings-modal.jsx';
import TwCodeLockWarning from '../tw-code-lock-warning.jsx';
import TWNews from '../menu-bar/tw-news.jsx';
import TWSecurityManager from '../../containers/tw-security-manager.jsx';
import TWCustomExtensionModal from '../../containers/tw-custom-extension-modal.jsx';
import TWRestorePointManager from '../../containers/tw-restore-point-manager.jsx';
import TWFontsModal from '../../containers/tw-fonts-modal.jsx';
import TWUnknownPlatformModal from '../../containers/tw-unknown-platform-modal.jsx';
import TWInvalidProjectModal from '../../containers/tw-invalid-project-modal.jsx';
import CollaborationCursor from '../collaboration-cursor/collaboration-cursor.jsx';
import UpdateModal from '../tw-update-modal/update-modal.jsx';
import Onboarding from '../onboarding/onboarding.jsx';
import {checkForUpdates} from '../../lib/update-checker';

import {
    STAGE_SIZE_MODES,
    STAGE_DISPLAY_SIZES,
    FIXED_WIDTH,
    UNCONSTRAINED_NON_STAGE_WIDTH
} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import {Theme} from '../../lib/themes';

import {isRendererSupported, isBrowserSupported} from '../../lib/tw-environment-support-prober';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from '!../../lib/tw-recolor/build!./icon--code.svg';
import costumesIcon from '!../../lib/tw-recolor/build!./icon--costumes.svg';
import soundsIcon from '!../../lib/tw-recolor/build!./icon--sounds.svg';
import statementIcon from '!../../lib/tw-recolor/build!./icon--statement.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

const getFullscreenBackgroundColor = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('fullscreen-background')) {
        return params.get('fullscreen-background');
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return '#111';
    }
    return 'white';
};

const fullscreenBackgroundColor = getFullscreenBackgroundColor();

const GUIComponent = props => {
    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        customStageSize,
        enableCommunity,
        intl,
        isCreating,
        isEmbedded,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isWindowFullScreen,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onClickAddonSettings,
        onClickDesktopSettings,
        onClickNewWindow,
        onClickPackager,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onOpenCustomExtensionModal,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        securityManager,
        showComingSoon,
        showOpenFilePicker,
        showSaveFilePicker,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        usernameModalVisible,
        settingsModalVisible,
        customExtensionModalVisible,
        fontsModalVisible,
        unknownPlatformModalVisible,
        invalidProjectModalVisible,
        vm,
        forumUser,
        onSetForumUser,
        onLogoutForumUser,
        ...componentProps
    } = omit(props, 'dispatch');

    // tw: 积木整合区（左侧积木面板）宽度可调 —— 在舞台列与积木列之间加可拖拽竖条
    const [blocksWidth, setBlocksWidth] = React.useState(() => {
        const stored = parseInt(localStorage.getItem('frostBlocksWidth'), 10);
        return Number.isFinite(stored) && stored >= 320 && stored <= 1100 ? stored : null;
    });
    const resizeState = React.useRef(null);
    // rAF coalescing for the resize drag so pointermove (which can fire far
    // more often than 60Hz) doesn't trigger a full React re-render per event.
    const resizeRaf = React.useRef(null);
    const resizeNext = React.useRef(null);

    const handleResizeMove = React.useCallback((e) => {
        const s = resizeState.current;
        if (!s) return;
        const delta = e.clientX - s.startX;
        const deltaSigned = s.isRtl ? -delta : delta;
        let next = s.startWidth + deltaSigned;
        next = Math.max(320, Math.min(1100, next));
        resizeNext.current = next;
        if (resizeRaf.current) return;
        resizeRaf.current = requestAnimationFrame(() => {
            resizeRaf.current = null;
            setBlocksWidth(resizeNext.current);
        });
    }, []);

    const handleResizeEnd = React.useCallback(() => {
        if (resizeRaf.current) {
            cancelAnimationFrame(resizeRaf.current);
            resizeRaf.current = null;
        }
        resizeState.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
        setBlocksWidth(current => {
            if (current) localStorage.setItem('frostBlocksWidth', String(current));
            return current;
        });
    }, [handleResizeMove]);

    const handleResizeStart = React.useCallback((e) => {
        e.preventDefault();
        const editorEl = e.currentTarget.previousElementSibling;
        const startWidth = editorEl ? editorEl.offsetWidth : 600;
        resizeState.current = {
            startWidth,
            startX: e.clientX,
            isRtl: document.documentElement.dir === 'rtl'
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeEnd);
    }, [handleResizeMove, handleResizeEnd]);


    // 启动时自动检查更新（延迟 2 秒，不影响启动速度）
    React.useEffect(() => {
        const timer = setTimeout(async () => {
            try {
                const result = await checkForUpdates();
                if (result.hasUpdate && result.isFirstSeen && result.release) {
                    window.dispatchEvent(new CustomEvent('show-update-modal', {
                        detail: {release: result.release}
                    }));
                }
            } catch (e) {
                // 静默失败，不影响正常使用
                console.warn('[更新检测] 检查失败:', e);
            }
        }, 2000);
        
        return () => clearTimeout(timer);
    }, []);
    
    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    const unconstrainedWidth = (
        UNCONSTRAINED_NON_STAGE_WIDTH +
        FIXED_WIDTH +
        Math.max(0, customStageSize.width - FIXED_WIDTH)
    );
    // tw: 手机端（窄屏）检测——整个编辑器切换为竖向堆叠布局并强制小舞台。
    return (<MediaQuery maxWidth={767}>{isPhone => (
        <MediaQuery minWidth={unconstrainedWidth}>{isUnconstrained => {
            const stageSize = isPhone ?
                STAGE_DISPLAY_SIZES.small :
                resolveStageSize(stageSizeMode, isUnconstrained);

            const alwaysEnabledModals = (
                <React.Fragment>
                    <TWSecurityManager securityManager={securityManager} />
                    <TWRestorePointManager />
                    <CollaborationCursor />
                    <UpdateModal />
                    {usernameModalVisible && <TWUsernameModal />}
                    {settingsModalVisible && <TWSettingsModal />}
                    {customExtensionModalVisible && <TWCustomExtensionModal />}
                    {fontsModalVisible && <TWFontsModal />}
                    {unknownPlatformModalVisible && <TWUnknownPlatformModal />}
                    {invalidProjectModalVisible && <TWInvalidProjectModal />}
                    {/* tw: 代码锁定模式——直接顶层打开编辑器且作品锁定时，强制退回 embed 播放页 */}
                    <TwCodeLockWarning />
                    {/* tw: 更新日志弹窗——从 GitHub 最新 Release 同步，有新版本时自动居中弹出 */}
                    <TWNews />
                </React.Fragment>
            );

            return isPlayerOnly ? (
                <React.Fragment>
                    {/* TW: When the window is fullscreen, use an element to display the background color */}
                    {/* The default color for transparency is inconsistent between browsers */}
                    {/* and there isn't an existing */}
                    {/* element for us to style that fills the entire screen. */}
                    {isWindowFullScreen ? (
                        <div
                            className={styles.fullscreenBackground}
                            style={{
                                backgroundColor: fullscreenBackgroundColor
                            }}
                        />
                    ) : null}
                    <Box
                        className={classNames(
                            styles.playerWrapper,
                            isEmbedded && styles.embedded
                        )}
                    >
                        <StageWrapper
                            isFullScreen={isFullScreen}
                            isEmbedded={isEmbedded}
                            isRendererSupported={isRendererSupported()}
                            isRtl={isRtl}
                            loading={loading}
                            stageSize={STAGE_SIZE_MODES.full}
                            vm={vm}
                        >
                            {alertsVisible ? (
                                <Alerts className={styles.alertsContainer} />
                            ) : null}
                        </StageWrapper>
                    </Box>
                    {alwaysEnabledModals}
                </React.Fragment>
            ) : (
                <Box
                    className={classNames(styles.pageWrapper, {
                        [styles.phoneMode]: isPhone
                    })}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    style={isPhone ? null : {
                        minWidth: 1024 + Math.max(0, customStageSize.width - 480),
                        minHeight: 640 + Math.max(0, customStageSize.height - 360)
                    }}
                    {...componentProps}
                >
                    {alwaysEnabledModals}
                    <Onboarding />
                    {telemetryModalVisible ? (
                        <TelemetryModal
                            isRtl={isRtl}
                            isTelemetryEnabled={isTelemetryEnabled}
                            onCancel={onTelemetryModalCancel}
                            onOptIn={onTelemetryModalOptIn}
                            onOptOut={onTelemetryModalOptOut}
                            onRequestClose={onRequestCloseTelemetryModal}
                            onShowPrivacyPolicy={onShowPrivacyPolicy}
                        />
                    ) : null}
                    {loading ? (
                        <Loader
                            isFullScreen
                            showBlockProgress={!isCreating}
                        />
                    ) : null}
                    {isCreating ? (
                        <Loader
                            isFullScreen
                            messageId="gui.loader.creating"
                        />
                    ) : null}
                    {isBrowserSupported() ? null : (
                        <BrowserModal
                            isRtl={isRtl}
                            onClickDesktopSettings={onClickDesktopSettings}
                        />
                    )}
                    {tipsLibraryVisible ? (
                        <TipsLibrary />
                    ) : null}
                    {cardsVisible ? (
                        <Cards />
                    ) : null}
                    {alertsVisible ? (
                        <Alerts className={styles.alertsContainer} />
                    ) : null}
                    {connectionModalVisible ? (
                        <ConnectionModal
                            vm={vm}
                        />
                    ) : null}
                    {loading ? (
                        <Loader
                            vm={vm}
                            isFullScreen={isFullScreen}
                            messageId={isCreating ? 'gui.loader.creating' : 'gui.loader.headline'}
                            showBlockProgress={!isCreating}
                        />
                    ) : null}
                    {costumeLibraryVisible ? (
                        <CostumeLibrary
                            vm={vm}
                            onRequestClose={onRequestCloseCostumeLibrary}
                        />
                    ) : null}
                    {backdropLibraryVisible ? (
                        <BackdropLibrary
                            vm={vm}
                            onRequestClose={onRequestCloseBackdropLibrary}
                        />
                    ) : null}
                    <MenuBar
                        accountNavOpen={accountNavOpen}
                        authorId={authorId}
                        authorThumbnailUrl={authorThumbnailUrl}
                        authorUsername={authorUsername}
                        canChangeLanguage={canChangeLanguage}
                        canChangeTheme={canChangeTheme}
                        canCreateCopy={canCreateCopy}
                        canCreateNew={canCreateNew}
                        canEditTitle={canEditTitle}
                        canManageFiles={canManageFiles}
                        canRemix={canRemix}
                        canSave={canSave}
                        canShare={canShare}
                        className={styles.menuBarPosition}
                        enableCommunity={enableCommunity}
                        isShared={isShared}
                        isTotallyNormal={isTotallyNormal}
                        logo={logo}
                        renderLogin={renderLogin}
                        showComingSoon={showComingSoon}
                        showOpenFilePicker={showOpenFilePicker}
                        showSaveFilePicker={showSaveFilePicker}
                        onClickAbout={onClickAbout}
                        onClickAccountNav={onClickAccountNav}
                        onClickAddonSettings={onClickAddonSettings}
                        onClickDesktopSettings={onClickDesktopSettings}
                        onClickNewWindow={onClickNewWindow}
                        onClickPackager={onClickPackager}
                        onClickLogo={onClickLogo}
                        onCloseAccountNav={onCloseAccountNav}
                        onLogOut={onLogOut}
                        onOpenRegistration={onOpenRegistration}
                        onProjectTelemetryEvent={onProjectTelemetryEvent}
                        onSeeCommunity={onSeeCommunity}
                        onShare={onShare}
                        onStartSelectingFileUpload={onStartSelectingFileUpload}
                        onToggleLoginOpen={onToggleLoginOpen}
                        forumUser={forumUser}
                        onSetForumUser={onSetForumUser}
                        onLogoutForumUser={onLogoutForumUser}
                    />
                    <Box className={styles.bodyWrapper}>
                        <Box className={classNames(styles.flexWrapper, isEmbedded && styles.embedded)}>
                            {!isEmbedded && (<Box
                                className={styles.editorWrapper}
                                style={blocksWidth ? {flex: `0 1 ${blocksWidth}px`, minWidth: 320} : undefined}
                            >
                                <Tabs
                                    forceRenderTabPanel
                                    className={tabClassNames.tabs}
                                    selectedIndex={activeTabIndex}
                                    selectedTabClassName={tabClassNames.tabSelected}
                                    selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                    onSelect={onActivateTab}
                                >
                                    <TabList className={tabClassNames.tabList}>
                                        <Tab className={tabClassNames.tab}>
                                            <img
                                                draggable={false}
                                                src={codeIcon()}
                                            />
                                            <FormattedMessage
                                                defaultMessage="Code"
                                                description="Button to get to the code panel"
                                                id="gui.gui.codeTab"
                                            />
                                        </Tab>
                                        <Tab
                                            className={tabClassNames.tab}
                                            onClick={onActivateCostumesTab}
                                        >
                                            <img
                                                draggable={false}
                                                src={costumesIcon()}
                                            />
                                            {targetIsStage ? (
                                                <FormattedMessage
                                                    defaultMessage="Backdrops"
                                                    description="Button to get to the backdrops panel"
                                                    id="gui.gui.backdropsTab"
                                                />
                                            ) : (
                                                <FormattedMessage
                                                    defaultMessage="Costumes"
                                                    description="Button to get to the costumes panel"
                                                    id="gui.gui.costumesTab"
                                                />
                                            )}
                                        </Tab>
                                        <Tab
                                            className={tabClassNames.tab}
                                            onClick={onActivateSoundsTab}
                                        >
                                            <img
                                                draggable={false}
                                                src={soundsIcon()}
                                            />
                                            <FormattedMessage
                                                defaultMessage="Sounds"
                                                description="Button to get to the sounds panel"
                                                id="gui.gui.soundsTab"
                                            />
                                        </Tab>
                                        <Tab className={tabClassNames.tab}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                <img
                                                    draggable={false}
                                                    src={statementIcon()}
                                                    alt="作品说明"
                                                    title="作品说明"
                                                    style={{width: '16px', height: '16px'}}
                                                />
                                                <span>作品说明</span>
                                            </div>
                                        </Tab>
                                    </TabList>
                                    <TabPanel className={tabClassNames.tabPanel}>
                                        <Box className={styles.blocksWrapper}>
                                            <Blocks
                                                key={`${blocksId}/${theme.id}`}
                                                canUseCloud={canUseCloud}
                                                grow={1}
                                                isVisible={blocksTabVisible}
                                                options={{
                                                    media: `${basePath}static/${theme.getBlocksMediaFolder()}/`
                                                }}
                                                stageSize={stageSize}
                                                onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                                                theme={theme}
                                                vm={vm}
                                            />
                                        </Box>
                                        <Box className={styles.extensionButtonContainer}>
                                            <button
                                                className={styles.extensionButton}
                                                title={intl.formatMessage(messages.addExtension)}
                                                onClick={onExtensionButtonClick}
                                            >
                                                <img
                                                    className={styles.extensionButtonIcon}
                                                    draggable={false}
                                                    src={addExtensionIcon}
                                                />
                                            </button>
                                        </Box>
                                        <Box className={styles.watermark}>
                                            <Watermark />
                                        </Box>
                                    </TabPanel>
                                    <TabPanel className={tabClassNames.tabPanel}>
                                        {costumesTabVisible ? <CostumeTab
                                            vm={vm}
                                        /> : null}
                                    </TabPanel>
                                    <TabPanel className={tabClassNames.tabPanel}>
                                        {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                                    </TabPanel>
                                    <TabPanel className={tabClassNames.tabPanel}>
                                        <ProjectStatement vm={vm} />
                                    </TabPanel>
                                </Tabs>
                                {backpackVisible ? (
                                    <Backpack host={backpackHost} />
                                ) : null}
                            </Box>)}

                            {!isEmbedded && !isPhone && (
                                <Box
                                    className={styles.resizeHandle}
                                    onMouseDown={handleResizeStart}
                                    title="拖拽调整积木栏宽度"
                                />
                            )}

                            <Box
                                className={classNames(styles.stageAndTargetWrapper, styles[stageSize])}
                                style={blocksWidth ? {flexGrow: 1} : undefined}
                            >
                                <StageWrapper
                                    isFullScreen={isFullScreen}
                                    isRendererSupported={isRendererSupported()}
                                    isRtl={isRtl}
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                                {!isEmbedded && (<Box className={styles.targetWrapper}>
                                    <TargetPane
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                </Box>)}
                            </Box>
                        </Box>
                    </Box>
                    <DragLayer />
                    <CollaborationCursor />
                </Box>
            );
        }}</MediaQuery>
    )}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isEmbedded: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isWindowFullScreen: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickAddonSettings: PropTypes.func,
    onClickDesktopSettings: PropTypes.func,
    onClickNewWindow: PropTypes.func,
    onClickPackager: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    forumUser: PropTypes.shape({
        user: PropTypes.object,
        loggedIn: PropTypes.bool,
        status: PropTypes.string
    }),
    onSetForumUser: PropTypes.func,
    onLogoutForumUser: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    securityManager: PropTypes.shape({}),
    showComingSoon: PropTypes.bool,
    showOpenFilePicker: PropTypes.func,
    showSaveFilePicker: PropTypes.func,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.instanceOf(Theme),
    tipsLibraryVisible: PropTypes.bool,
    usernameModalVisible: PropTypes.bool,
    settingsModalVisible: PropTypes.bool,
    customExtensionModalVisible: PropTypes.bool,
    fontsModalVisible: PropTypes.bool,
    unknownPlatformModalVisible: PropTypes.bool,
    invalidProjectModalVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    customStageSize: state.scratchGui.customStageSize,
    isWindowFullScreen: state.scratchGui.tw.isWindowFullScreen,
    // This is the button's mode, as opposed to the actual current state
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
