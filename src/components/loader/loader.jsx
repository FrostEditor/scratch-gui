import React from 'react';
import {FormattedMessage, injectIntl, intlShape, defineMessages} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './loader.css';
import {getIsLoadingWithId} from '../../reducers/project-state';
// Use snowflake characters for the loading animation

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
            'messageRef'
        ]);
        this.barInnerEl = null;
        this.messageEl = null;
        this.ignoreProgress = false;
        this.finishing = false;
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
    componentWillUnmount () {
        this.props.vm.off('ASSET_PROGRESS', this.handleAssetProgress);
        this.props.vm.runtime.off('PROJECT_LOADED', this.handleProjectLoaded);
    }
    handleAssetProgress (finished, total) {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) {
            return;
        }

        if (total === 0) {
            // Started loading a new project.
            this.barInnerEl.style.width = '0';
            this.messageEl.textContent = this.props.intl.formatMessage(messages.projectData);
        } else {
            this.barInnerEl.style.width = `${finished / total * 100}%`;
            const message = this.props.isRemote ? messages.downloadingAssets : messages.loadingAssets;
            this.messageEl.textContent = this.props.intl.formatMessage(message, {
                complete: finished,
                total
            });
        }
    }
    handleProjectLoaded () {
        if (this.ignoreProgress || !this.barInnerEl || !this.messageEl) return;

        // Mark finishing state and allow one animation cycle before fully closing loader
        this.finishing = true;
        this.setState({finishing: true});
        // hide any loading text immediately
        try {
            this.messageEl.textContent = '';
        } catch (e) {}
        // ensure progress bar visually full
        try {
            this.barInnerEl.style.width = '100%';
        } catch (e) {}
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
    render () {
        const snowSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.2 4.2l2.8 2.8"/><path d="M17 17l2.8 2.8"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.2 19.8l2.8-2.8"/><path d="M17 7l2.8-2.8"/><circle cx="12" cy="12" r="1.4" fill="#FFFFFF" stroke="none"/></g></svg>';
        const snowData = 'data:image/svg+xml;utf8,' + encodeURIComponent(snowSvg);
        return (
            <div
                className={classNames(styles.background, {
                    [styles.fullscreen]: this.props.isFullScreen
                })}
            >
                <div className={styles.container}>
                    {this.props.messageId !== 'gui.loader.creating' && (
                        <div className={classNames(styles.title, {[styles.hidden]: this.state.finishing})}>
                            {mainMessages[this.props.messageId]}
                        </div>
                    )}

                    {this.props.messageId === 'gui.loader.creating' ? (
                        <div className={styles.snowTopWrapper}>
                            <div className={styles.snowAnimation}>
                                <span
                                    className={styles.snowflake}
                                    style={{
                                        animationDelay: '0s',
                                        color: '#FFFFFF',
                                        fontSize: '120px',
                                        opacity: 1,
                                        display: 'inline-block',
                                        zIndex: 11
                                    }}
                                >
                                    ❄
                                </span>
                            </div>
                            
                            {/* keep a hidden message element so messageRef is available for progress updates */}
                            <div
                                className={styles.snowMessageHidden}
                                ref={this.messageRef}
                                aria-hidden="true"
                            />
                        </div>
                    ) : (
                        <div className={styles.snowWrapper}>
                            <div className={styles.snowAnimation}>
                                <span
                                    className={styles.snowflake}
                                    style={{
                                        animationDelay: '0s',
                                        opacity: 1,
                                        display: 'inline-block',
                                        zIndex: 11
                                    }}
                                >
                                    <img src={snowData} alt="snow" style={{width:120,height:120,display:'block'}} />
                                </span>
                            </div>
                            
                            <div
                                className={styles.snowMessage}
                                ref={this.messageRef}
                            />
                        </div>
                    )}
                    
                    {/* 进度条 */}
                    <div className={styles['bar-outer']}>
                        <div
                            className={styles['bar-inner']}
                            ref={this.barInnerRef}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

LoaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool,
    isRemote: PropTypes.bool,
    messageId: PropTypes.string,
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
    isFullScreen: false,
    messageId: 'gui.loader.headline'
};

const mapStateToProps = state => ({
    isRemote: getIsLoadingWithId(state.scratchGui.projectState.loadingState),
    vm: state.scratchGui.vm
});

const mapDispatchToProps = () => ({});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(LoaderComponent));
