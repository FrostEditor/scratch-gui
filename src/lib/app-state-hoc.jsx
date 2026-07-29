import React from 'react';
import PropTypes from 'prop-types';
import {Provider} from 'react-redux';
import {createStore, combineReducers, compose} from 'redux';
import ConnectedIntlProvider from './connected-intl-provider.jsx';
import AddonHooks from '../addons/hooks';

import localesReducer, {initLocale, localesInitialState} from '../reducers/locales';

import {setPlayer, setFullScreen} from '../reducers/mode.js';

import locales from '@turbowarp/scratch-l10n';
import {detectLocale} from './detect-locale';

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

/*
 * Higher Order Component to provide redux state. If an `intl` prop is provided
 * it will override the internal `intl` redux state
 * @param {React.Component} WrappedComponent - component to provide state for
 * @param {boolean} localesOnly - only provide the locale state, not everything
 *                      required by the GUI. Used to exclude excess state when
                        only rendering modals, not the GUI.
 * @returns {React.Component} component with redux and intl state provided
 */
const AppStateHOC = function (WrappedComponent, localesOnly) {
    class AppStateWrapper extends React.Component {
        constructor (props) {
            super(props);
            let initialState = {};
            let reducers = {};
            let enhancer;

            let initializedLocales = localesInitialState;
            const locale = detectLocale(Object.keys(locales));
            if (locale !== 'en') {
                initializedLocales = initLocale(initializedLocales, locale);
            }
            if (localesOnly) {
                // Used for instantiating minimal state for the unsupported
                // browser modal
                reducers = {locales: localesReducer};
                initialState = {locales: initializedLocales};
                enhancer = composeEnhancers();
            } else {
                // You are right, this is gross. But it's necessary to avoid
                // importing unneeded code that will crash unsupported browsers.
                const guiRedux = require('../reducers/gui');
                const guiReducer = guiRedux.default;
                const {
                    guiInitialState,
                    guiMiddleware,
                    initFullScreen,
                    initPlayer,
                    initEmbedded,
                    initTelemetryModal
                } = guiRedux;
                const {ScratchPaintReducer} = require('./tw-scratch-paint');

                let initializedGui = guiInitialState;
                if (props.isFullScreen || props.isPlayerOnly) {
                    if (props.isFullScreen) {
                        initializedGui = initFullScreen(initializedGui);
                    }
                    if (props.isPlayerOnly) {
                        initializedGui = initPlayer(initializedGui);
                    }
                } else if (props.showTelemetryModal) {
                    initializedGui = initTelemetryModal(initializedGui);
                }
                // tw: 计算是否处于 embed（嵌入）模式：
                //   1) 显式传入 isEmbedded（embed.jsx 播放页）；
                //   2) 页面被嵌入到 iframe 中（window.self !== window.top）；
                //   3) URL 带 ?embed 参数。
                // 这样无论嵌入的是 embed 播放页、编辑器页还是首页，舞台都会居中、
                // 隐藏代码面板（与 embed.jsx 行为一致）。桌面端编辑器不在 iframe 内、
                // 也不带 ?embed，因此不受影响（保持完整编辑布局）。
                const isEmbeddedActive = props.isEmbedded ||
                    (typeof window !== 'undefined' && window.self !== window.top) ||
                    (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string' &&
                        window.location.search.indexOf('embed') !== -1);
                if (isEmbeddedActive) {
                    initializedGui = initEmbedded(initializedGui);
                }
                reducers = {
                    locales: localesReducer,
                    scratchGui: guiReducer,
                    scratchPaint: ScratchPaintReducer
                };
                initialState = {
                    locales: initializedLocales,
                    scratchGui: initializedGui
                };
                enhancer = composeEnhancers(guiMiddleware);
            }
            const reducer = combineReducers(reducers);
            const reducer2 = (previousState, action) => {
                const nextState = reducer(previousState, action);
                AddonHooks.appStateReducer(action, previousState, nextState);
                return nextState;
            };
            this.store = createStore(
                reducer2,
                initialState,
                enhancer
            );
            window.ReduxStore = this.store;
            AddonHooks.appStateStore = this.store;
        }
        componentDidUpdate (prevProps) {
            if (localesOnly) return;
            if (prevProps.isPlayerOnly !== this.props.isPlayerOnly) {
                this.store.dispatch(setPlayer(this.props.isPlayerOnly));
            }
            if (prevProps.isFullScreen !== this.props.isFullScreen) {
                this.store.dispatch(setFullScreen(this.props.isFullScreen));
            }
        }
        render () {
            const {
                isFullScreen, // eslint-disable-line no-unused-vars
                isPlayerOnly, // eslint-disable-line no-unused-vars
                showTelemetryModal, // eslint-disable-line no-unused-vars
                ...componentProps
            } = this.props;
            return (
                <Provider store={this.store}>
                    <ConnectedIntlProvider>
                        <WrappedComponent
                            {...componentProps}
                        />
                    </ConnectedIntlProvider>
                </Provider>
            );
        }
    }
    AppStateWrapper.propTypes = {
        isFullScreen: PropTypes.bool,
        isPlayerOnly: PropTypes.bool,
        isTelemetryEnabled: PropTypes.bool,
        showTelemetryModal: PropTypes.bool,
        isEmbedded: PropTypes.bool
    };
    return AppStateWrapper;
};

export default AppStateHOC;
