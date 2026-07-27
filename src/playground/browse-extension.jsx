import './import-first';

import {defineMessages, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import {compose} from 'redux';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import TWEmbedFullScreenHOC from '../lib/tw-embed-fullscreen-hoc.jsx';
import TWStateManagerHOC from '../lib/tw-state-manager-hoc.jsx';
import {Theme} from '../lib/themes/index.js';

import GUI from './render-gui.jsx';
import ExtensionBlocksPreview from '../components/tw-extension-blocks-preview/extension-blocks-preview.jsx';
import browseExtensionBlocks from '../lib/tw-browse-extension';
import render from './app-target';
import styles from './browse-extension.css';

// 读取网址参数：
//   ?url=    （必填）扩展编译后 JS 的地址，例如 https://extensions.turbowarp.org/pen.js
//   &name=   （可选）展示用的扩展名称
//   &extension=  与 url= 同义，兼容旧写法
const urlParams = new URLSearchParams(location.search);
const extensionURL = urlParams.get('url') || urlParams.get('extension') || '';
const extensionName = urlParams.get('name') || '';

const messages = defineMessages({
    missingPrefix: {
        defaultMessage: '请在网址后附加 ',
        description: 'Hint shown when no extension URL is provided (before the code sample)',
        id: 'tw.browseExtension.missingPrefix'
    },
    missingSuffix: {
        defaultMessage: ' 来浏览扩展积木。',
        description: 'Hint shown when no extension URL is provided (after the code sample)',
        id: 'tw.browseExtension.missingSuffix'
    },
    examplePrefix: {
        defaultMessage: '例如：',
        description: 'Example URL hint prefix',
        id: 'tw.browseExtension.examplePrefix'
    },
    errorPrefix: {
        defaultMessage: '加载扩展失败：',
        description: 'Error prefix when the extension fails to load',
        id: 'tw.browseExtension.errorPrefix'
    },
    loading: {
        defaultMessage: '正在加载扩展…',
        description: 'Shown while the extension is loading',
        id: 'tw.browseExtension.loading'
    }
});

// 提示文案里出现的「代码」片段（非 JSX 字面量，避免触发 jsx-no-literals）。
const URL_HINT = '?url=扩展JS地址';
const EXAMPLE_URL = 'browse-extension.html?url=https://extensions.turbowarp.org/pen.js';

// 编辑器 GUI 挂载后会通过 onVmInit 把 vm 交给我们，
// 扩展要加载进这个 vm，才能复用它和 scratch-blocks 之间的桥接。
let vm = null;

const onVmInit = _vm => {
    vm = _vm;
};

class BrowseExtensionPage extends React.Component {
    constructor (props) {
        super(props);
        this._timer = null;
        this.state = {
            status: extensionURL ? 'loading' : 'missing', // loading | ok | empty | error | missing
            name: extensionName,
            blocks: [],
            error: ''
        };
    }

    componentDidMount () {
        this.loadExtension();
    }

    componentWillUnmount () {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    loadExtension () {
        if (!extensionURL) {
            this.setState({status: 'missing'});
            return;
        }
        // vm 可能还没初始化好，稍后重试。
        if (!vm) {
            this._timer = setTimeout(() => this.loadExtension(), 100);
            return;
        }
        browseExtensionBlocks(vm, extensionURL, {name: extensionName})
            .then(({name, blocks}) => {
                // 沉浸式界面不显示头部，扩展名放到浏览器标签页标题上。
                if (name) {
                    document.title = name;
                }
                this.setState({
                    status: (blocks && blocks.length) ? 'ok' : 'empty',
                    name,
                    blocks
                });
            })
            .catch(err => {
                this.setState({
                    status: 'error',
                    error: (err && (err.message || String(err))) || '加载扩展失败'
                });
            });
    }

    render () {
        const {
            status,
            blocks,
            error
        } = this.state;
        const intl = this.props.intl;

        return (
            <React.Fragment>
                {/* 后台挂载编辑器，只为建立 VM ↔ scratch-blocks 的桥接；用覆盖层挡住它。 */}
                <div className={styles.hiddenGui}>
                    <GUI
                        {...this.props}
                        isEmbedded
                        projectId="0"
                        onVmInit={onVmInit}
                        routingStyle="none"
                        theme={Theme.light}
                    />
                </div>

                {/* 前台全屏积木浏览界面（沉浸式：无头部、无边框，仅积木画布）。 */}
                <div className={styles.overlay}>
                    <div className={styles.body}>
                        {status === 'missing' && (
                            <div className={styles.message}>
                                <p>
                                    {intl.formatMessage(messages.missingPrefix)}
                                    <code>{URL_HINT}</code>
                                    {intl.formatMessage(messages.missingSuffix)}
                                </p>
                                <p>
                                    {intl.formatMessage(messages.examplePrefix)}
                                    <code>{EXAMPLE_URL}</code>
                                </p>
                            </div>
                        )}
                        {status === 'error' && (
                            <div className={styles.message}>
                                <p>{intl.formatMessage(messages.errorPrefix)}</p>
                                <p><code>{error}</code></p>
                            </div>
                        )}
                        {status === 'loading' && (
                            <div className={styles.message}>{intl.formatMessage(messages.loading)}</div>
                        )}
                        {(status === 'ok' || status === 'empty') && (
                            <ExtensionBlocksPreview
                                frameless
                                vm={vm}
                                blocks={blocks}
                                extensionId={extensionURL}
                                isRtl={this.props.isRtl}
                            />
                        )}
                    </div>
                </div>
            </React.Fragment>
        );
    }
}

BrowseExtensionPage.propTypes = {
    intl: intlShape,
    isRtl: PropTypes.bool
};

const WrappedPage = compose(
    AppStateHOC,
    TWStateManagerHOC,
    TWEmbedFullScreenHOC
)(injectIntl(BrowseExtensionPage));

render(<WrappedPage />);
