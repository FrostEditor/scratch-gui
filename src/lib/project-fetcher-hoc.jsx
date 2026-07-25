import React from 'react';
import PropTypes from 'prop-types';
import {intlShape, injectIntl} from 'react-intl';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';

import {setProjectUnchanged} from '../reducers/project-changed';
import {
    LoadingStates,
    getIsCreatingNew,
    getIsFetchingWithId,
    getIsLoading,
    getIsShowingProject,
    onFetchedProjectData,
    projectError,
    setProjectId
} from '../reducers/project-state';
import {
    activateTab,
    BLOCKS_TAB_INDEX
} from '../reducers/editor-tab';

import log from './log';
import storage from './storage';

import VM from 'scratch-vm';
import {fetchProjectMeta} from './tw-project-meta-fetcher-hoc.jsx';
import {setCodeLocked} from '../reducers/tw';

// TW: Temporary hack for project tokens
const fetchProjectToken = async projectId => {
    if (projectId === '0') {
        return null;
    }
    // Parse ?token=abcdef
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('token')) {
        return searchParams.get('token');
    }
    // Parse #1?token=abcdef
    const hashParams = new URLSearchParams(location.hash.split('?')[1]);
    if (hashParams.has('token')) {
        return hashParams.get('token');
    }
    try {
        const metadata = await fetchProjectMeta(projectId);
        return metadata.project_token;
    } catch (e) {
        log.error(e);
        throw new Error('Cannot access project token. Project is probably unshared. See https://docs.turbowarp.org/unshared-projects');
    }
};

/* Higher Order Component to provide behavior for loading projects by id. If
 * there's no id, the default project is loaded.
 * @param {React.Component} WrappedComponent component to receive projectData prop
 * @returns {React.Component} component with project loading behavior
 */

// tw: 判断一个 URL 是否为跨域（data: 视为同源，不代理）
const isCrossOrigin = (urlString) => {
    try {
        const parsed = new URL(urlString, window.location.href);
        if (parsed.protocol === 'data:') return false;
        return parsed.origin !== window.location.origin;
    } catch (e) {
        return true; // 解析不出就按跨域处理，交给代理兜底
    }
};

// tw: 将跨域地址改写为同源代理地址
const toProxyUrl = (urlString) => `/proxy?url=${encodeURIComponent(urlString)}`;

const ProjectFetcherHOC = function (WrappedComponent) {
    class ProjectFetcherComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'fetchProject'
            ]);
            storage.setProjectHost(props.projectHost);
            storage.setProjectToken(props.projectToken);
            storage.setAssetHost(props.assetHost);
            storage.setTranslatorFunction(props.intl.formatMessage);
            // props.projectId might be unset, in which case we use our default;
            // or it may be set by an even higher HOC, and passed to us.
            // Either way, we now know what the initial projectId should be, so
            // set it in the redux store.
            if (
                props.projectId !== '' &&
                props.projectId !== null &&
                typeof props.projectId !== 'undefined'
            ) {
                this.props.setProjectId(props.projectId.toString());
            }
        }
        componentDidUpdate (prevProps) {
            if (prevProps.projectHost !== this.props.projectHost) {
                storage.setProjectHost(this.props.projectHost);
            }
            if (prevProps.projectToken !== this.props.projectToken) {
                storage.setProjectToken(this.props.projectToken);
            }
            if (prevProps.assetHost !== this.props.assetHost) {
                storage.setAssetHost(this.props.assetHost);
            }
            if (this.props.isFetchingWithId && !prevProps.isFetchingWithId) {
                this.fetchProject(this.props.reduxProjectId, this.props.loadingState);
            }
            if (this.props.isShowingProject && !prevProps.isShowingProject) {
                this.props.onProjectUnchanged();
            }
            if (this.props.isShowingProject && (prevProps.isLoadingProject || prevProps.isCreatingNew)) {
                this.props.onActivateTab(BLOCKS_TAB_INDEX);
            }
        }
        fetchProject (projectId, loadingState) {
            // tw: clear and stop the VM before fetching
            // these will also happen later after the project is fetched, but fetching may take a while and
            // the project shouldn't be running while fetching the new project
            this.props.vm.clear();
            this.props.vm.quit();

            let assetPromise;
            // In case running in node...
            let projectUrl = null;
            // tw: 代码锁定模式 —— 远程作品 URL 携带 ?lock 参数时，隐藏“在编辑器中打开”按钮
            let codeLocked = false;
            if (typeof URLSearchParams !== 'undefined') {
                const searchParams = new URLSearchParams(location.search);
                // tw: 支持两种跨域作品来源：
                //   ?project_url=https://...   （标准 TurboWarp 形式）
                //   ?=https://...              （无参数名的简写形式）
                projectUrl = searchParams.get('project_url') || searchParams.get('');
                // tw: 代码锁定模式也允许直接写在嵌入页 URL 上（如 &lock），与远程 URL 上的 ?lock 等效
                if (searchParams.has('lock')) {
                    codeLocked = true;
                }
            }
            if (projectUrl) {
                if (
                    !projectUrl.startsWith('http:') &&
                    !projectUrl.startsWith('https:') &&
                    !projectUrl.startsWith('data:')
                ) {
                    projectUrl = `https://${projectUrl}`;
                }
                // tw: 解析远程作品 URL 上的 ?lock 参数，开启代码锁定模式。
                // 命中后从实际请求的 URL 中剔除该参数，避免远程服务器因未知参数报错。
                try {
                    const parsed = new URL(projectUrl, window.location.href);
                    if (parsed.searchParams.has('lock')) {
                        codeLocked = true;
                        parsed.searchParams.delete('lock');
                        projectUrl = parsed.href;
                    }
                } catch (e) {
                    // 解析失败则忽略，按未锁定处理
                }
                // tw: 跨域地址走同源 /proxy 代理，规避浏览器 CORS 限制。
                // 代理由 dev server（webpack.config.js）与生产代理（proxy-server.js）提供。
                // 同源 / data: 地址不代理，避免无谓转发与死循环。
                if (isCrossOrigin(projectUrl)) {
                    projectUrl = toProxyUrl(projectUrl);
                }
                assetPromise = fetch(projectUrl)
                    .then(r => {
                        if (!r.ok) {
                            throw new Error(`Request returned status ${r.status}`);
                        }
                        return r.arrayBuffer();
                    })
                    .then(buffer => {
                        // tw: 校验返回内容是否为 HTML（而非 .sb3 压缩包）。
                        // 代理未生效 / 远程返回错误页时，浏览器会收到一整页 HTML，
                        // 直接丢给 VM 会抛出难懂的 "is not valid JSON"，这里提前拦截。
                        const head = new Uint8Array(buffer.slice(0, 512));
                        const text = String.fromCharCode.apply(null, head).replace(/^\s+/, '');
                        if (text.startsWith('<')) {
                            throw new Error('远程地址返回的不是有效的 .sb3 作品文件（收到的是 HTML 页面）。' +
                                '请确认该 URL 直接在浏览器打开会下载 .sb3；' +
                                '若刚改过 webpack 配置，请重启 npm start 使 /proxy 代理生效。');
                        }
                        return {data: buffer};
                    });
            } else {
                // TW: Temporary hack for project tokens
                assetPromise = fetchProjectToken(projectId)
                    .then(token => {
                        storage.setProjectToken(token);
                        return storage.load(storage.AssetType.Project, projectId, storage.DataFormat.JSON);
                    });
            }

            // tw: 立即同步更新代码锁定状态，使“在编辑器中打开”按钮在加载时就被移除
            this.props.setCodeLocked(codeLocked);

            return assetPromise
                .then(projectAsset => {
                    if (projectAsset) {
                        this.props.onFetchedProjectData(projectAsset.data, loadingState);
                    } else {
                        // Treat failure to load as an error
                        // Throw to be caught by catch later on
                        throw new Error('Could not find project');
                    }
                })
                .catch(err => {
                    this.props.onError(err);
                    log.error(err);
                });
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                assetHost,
                intl,
                isLoadingProject: isLoadingProjectProp,
                loadingState,
                onActivateTab,
                onError: onErrorProp,
                onFetchedProjectData: onFetchedProjectDataProp,
                onProjectUnchanged,
                projectHost,
                projectId,
                reduxProjectId,
                setProjectId: setProjectIdProp,
                /* eslint-enable no-unused-vars */
                isFetchingWithId: isFetchingWithIdProp,
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    fetchingProject={isFetchingWithIdProp}
                    {...componentProps}
                />
            );
        }
    }
    ProjectFetcherComponent.propTypes = {
        assetHost: PropTypes.string,
        canSave: PropTypes.bool,
        intl: intlShape.isRequired,
        isCreatingNew: PropTypes.bool,
        isFetchingWithId: PropTypes.bool,
        isLoadingProject: PropTypes.bool,
        isShowingProject: PropTypes.bool,
        loadingState: PropTypes.oneOf(LoadingStates),
        onActivateTab: PropTypes.func,
        onError: PropTypes.func,
        onFetchedProjectData: PropTypes.func,
        onProjectUnchanged: PropTypes.func,
        projectHost: PropTypes.string,
        setCodeLocked: PropTypes.func,
        projectToken: PropTypes.string,
        projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        reduxProjectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        setProjectId: PropTypes.func,
        vm: PropTypes.instanceOf(VM)
    };
    ProjectFetcherComponent.defaultProps = {
        assetHost: 'https://assets.scratch.mit.edu',
        projectHost: 'https://projects.scratch.mit.edu'
    };

    const mapStateToProps = state => ({
        isCreatingNew: getIsCreatingNew(state.scratchGui.projectState.loadingState),
        isFetchingWithId: getIsFetchingWithId(state.scratchGui.projectState.loadingState),
        isLoadingProject: getIsLoading(state.scratchGui.projectState.loadingState),
        isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
        loadingState: state.scratchGui.projectState.loadingState,
        reduxProjectId: state.scratchGui.projectState.projectId,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onActivateTab: tab => dispatch(activateTab(tab)),
        onError: error => dispatch(projectError(error)),
        onFetchedProjectData: (projectData, loadingState) =>
            dispatch(onFetchedProjectData(projectData, loadingState)),
        setProjectId: projectId => dispatch(setProjectId(projectId)),
        onProjectUnchanged: () => dispatch(setProjectUnchanged()),
        setCodeLocked: codeLocked => dispatch(setCodeLocked(codeLocked))
    });
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(ProjectFetcherComponent));
};

export {
    ProjectFetcherHOC as default
};
