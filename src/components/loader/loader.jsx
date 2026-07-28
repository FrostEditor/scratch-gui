import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import {getIsLoadingWithId} from '../../reducers/project-state';
import loadImage from '../../../load.png'; // tw: 自定义加载图

const mainMessages = {
    'gui.loader.headline': (
        <FormattedMessage
            defaultMessage="Loading Project"
            description="Main loading message"
            id="gui.loader.headline"
        />
    ),
    'gui.loader.creating': (
        <FormattedMessage
            defaultMessage="Creating Project"
            description="Main creating message"
            id="gui.loader.creating"
        />
    )
};

const messages = defineMessages({
    projectData: {
        defaultMessage: 'Loading project …',
        description: 'Appears when loading project data, but not assets yet',
        id: 'tw.loader.projectData'
    },
    downloadingAssets: {
        defaultMessage: 'Downloading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project on a remote website',
        id: 'tw.loader.downloadingAssets'
    },
    loadingAssets: {
        defaultMessage: 'Loading assets ({complete}/{total}) …',
        description: 'Appears when loading project assets from a project file on the user\'s computer',
        id: 'tw.loader.loadingAssets'
    }
});

// Because progress events are fired so often during the very performance-critical loading
// process and React updates are very slow, we bypass React for updating the progress bar.

class LoaderComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAssetProgress',
            'handleProjectLoaded',
            'barInnerRef',
            'messageRef',
            'blockRef',
            'updateBlockText'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.blockEl = null;
        this.ignoreProgress = false;
        this.finishing = false;
        this.lastProgress = null; // {finished, total} 最近一次资产进度，用于 blockTotal 晚到时刷新
        this.state = {
            finishing: false
        };
    }
    componentDidMount () {
        this.handleAssetProgress(
            this.props.vm.runtime.finishedAssetRequests,
            this.props.vm.runtime.totalAssetRequests
        );
        this.props.vm.on('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.on('PROJECT_LOADED', this.handleProjectLoaded);
    }
    componentDidUpdate (prevProps) {
        // 积木总数或「是否显示积木进度」变化后，用最近一次资产进度刷新文本
        if (this.lastProgress &&
            (prevProps.blockTotal !== this.props.blockTotal ||
                prevProps.showBlockProgress !== this.props.showBlockProgress)) {
            this.updateBlockText(this.lastProgress.finished, this.lastProgress.total);
        }
    }
    componentWillUnmount () {
        this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded);
    }
    // 更新「已加载积木 X / 共 Y（Z%）」文本
    updateBlockText (finished, total) {
        if (!this.blockEl || !this.props.showBlockProgress || !(this.props.blockTotal > 0)) return;
        if (total === 0) {
            this.blockEl.textContent = `已加载积木 0 / 共 ${this.props.blockTotal}（0%）`;
            return;
        }
        const pct = finished / total;
        const loaded = Math.round(pct * this.props.blockTotal);
        this.blockEl.textContent = `已加载积木 ${loaded} / 共 ${this.props.blockTotal}（${Math.round(pct * 100)}%）`;
    }
    handleAssetProgress (finished, total) {
        if (!this.barInnerEl) {
            return;
        }
        this.lastProgress = {finished, total};

        if (total === 0) {
            // Started loading a new project.
            this.barInnerEl.style.width = '0';
            if (this.messageEl) {
                this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
            }
        } else {
            this.barInnerEl.style.width = `${finished / total * 100}%`;
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            if (this.messageEl) {
                this.messageEl.textContent = this.props.intl.formatMessage(message, {
                    complete: finished,
                    total
                });
            }
        }
        this.updateBlockText(finished, total);
    }
    handleProjectLoaded () {
        if (!this.barInnerEl) return;

        // Mark finishing state and allow one animation cycle before fully closing loader
        this.finishing = true;
        this.setState({finishing: true});
        // hide any loading text immediately
        try {
            if (this.messageEl) this.messageEl.textContent = '';
        } catch (e) {}
        // ensure progress bar visually full
        try {
            this.barInnerEl.style.width = '100%';
        } catch (e) {}
        // 结束时把积木数补齐为总数（100%）
        if (this.props.showBlockProgress && this.props.blockTotal > 0 && this.blockEl) {
            this.blockEl.textContent = `已加载积木 ${this.props.blockTotal} / 共 ${this.props.blockTotal}（100%）`;
        }
        const ANIMATION_MS = 1200;
        setTimeout(() => {
            this.ignoreProgress = true;
            this.finishing = false;
            try { this.setState({finishing: false}); } catch (e) {}
            try {
                this.props.vm.runtime.resetProgress();
            } catch (e) {}
        }, ANIMATION_MS);
    }
    barInnerRef (barInner) {
        this.barInnerEl = barInner;
    }
    messageRef (message) {
        this.messageEl = message;
    }
    blockRef (block) {
        this.blockEl = block;
    }
    render () {
        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                })}
            >
                {/* tw: 全屏加载背景图——铺满整个屏幕当作加载界面 */}
                <img
                    src={loadImage}
                    className={styles.loadImageBg}
                    alt=""
                    aria-hidden="true"
                />
                <div className={styles.container}>
                    {this.props.messageId !== 'gui.loader.creating' && (
                        <div className={classNames(styles.title, {[styles.hidden]: this.state.finishing})}>
                            {mainMessages[this.props.messageId]}
                        </div>
                    )}

                    {/* tw: 加载作品时，在图片下方显示积木进度（X / 共 Y，百分比） */}
                    <div
                        className={styles.blockText}
                        ref={this.blockRef}
                    />

                    {/* 进度条 */}
                    <div className={styles['bar-outer']}>
                        <div
                            className={styles['bar-inner']}
                            ref={this.barInnerRef}
                        />
                    </div>

                    {/* 隐藏的消息元素，供资产进度文本更新（保留引用，不直接展示） */}
                    <div
                        className={styles.snowMessageHidden}
                        ref={this.messageRef}
                        aria-hidden="true"
                    />
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    blockTotal: PropTypes.number,
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
    showBlockProgress: PropTypes.bool,
    vm: PropTypes.shape({
        on: PropTypes.func,
        off: PropTypes.func,
        runtime: PropTypes.shape({
            totalAssetRequests: PropTypes.number,
            finishedAssetRequests: PropTypes.number,
            resetProgress: PropTypes.func,
            on: PropTypes.func,
            off: PropTypes.func
        })
    })
};
LoaderComponent.defaultProps = {
    blockTotal: 0,
    isFullScreen: false,
    messageId: 'gui.loader.headline',
    showBlockProgress: false
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    vm: state.scratchGui.vm,
    blockTotal: state.scratchGui.projectBlockCount.total
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
