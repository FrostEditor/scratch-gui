/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {myProjects, listProjects} from '../../lib/forum/index.js';

const overlay = {
    position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000
};
const card = {
    background: '#fff', borderRadius: 12, padding: '24px 28px', width: 480,
    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', fontFamily: 'inherit'
};
const btn = {
    padding: '5px 12px', border: 'none', borderRadius: 8, fontSize: 12,
    fontWeight: 600, cursor: 'pointer', background: '#1a73e8', color: '#fff'
};
const btnGhost = {
    padding: '5px 12px', border: '1px solid #d9d9d9', borderRadius: 8,
    fontSize: 12, cursor: 'pointer', background: '#fff', color: '#333'
};
const btnGreen = {
    padding: '5px 12px', border: 'none', borderRadius: 8, fontSize: 12,
    fontWeight: 600, cursor: 'pointer', background: '#1a7f37', color: '#fff'
};
const tabStyle = (active) => ({
    padding: '8px 18px', fontSize: 13, cursor: 'pointer', border: 'none',
    background: 'transparent', color: active ? '#1a73e8' : '#999',
    fontWeight: active ? 600 : 400, borderBottom: active ? '2px solid #1a73e8' : '2px solid transparent'
});

const CATEGORY_LABELS = {
    game: '游戏', animation: '动画', story: '故事',
    music: '音乐', art: '美术', tutorial: '教程', other: '其他'
};

class ForumMyWorksModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            tab: 'mine',
            // 我的作品
            list: [], loading: true, error: '',
            // 作品广场
            exploreList: [], exploreLoading: false, exploreError: '',
            explorePage: 1, exploreTotal: 0, explorePageSize: 24,
            // 载入中（记录正在载入的作品 id）
            loadingId: null, loadError: ''
        };
    }
    componentDidMount () {
        if (this.props.open) this.load();
    }
    componentDidUpdate (prev) {
        if (this.props.open && !prev.open) {
            this.load();
        }
    }
    load = async () => {
        this.setState({loading: true, error: ''});
        try {
            const data = await myProjects();
            const list = Array.isArray(data) ? data : (data.items || []);
            this.setState({list, loading: false});
        } catch (e) {
            this.setState({error: e.message || '加载失败', loading: false});
        }
    };
    switchTab = (tab) => {
        this.setState({tab});
        if (tab === 'explore' && this.state.exploreList.length === 0 && !this.state.exploreLoading) {
            this.loadExplore(1);
        }
    };
    loadExplore = async (page) => {
        this.setState({exploreLoading: true, exploreError: ''});
        try {
            const data = await listProjects({page, sort: 'score'});
            const items = data.items || [];
            this.setState({
                exploreList: items,
                exploreLoading: false,
                explorePage: data.page || page,
                exploreTotal: data.total || 0,
                explorePageSize: data.pageSize || 24
            });
        } catch (e) {
            this.setState({exploreError: e.message || '加载失败', exploreLoading: false});
        }
    };
    handleLoad = async (p) => {
        if (!this.props.onLoad || this.state.loadingId) return;
        this.setState({loadingId: p.id, loadError: ''});
        try {
            await this.props.onLoad(p);
        } catch (e) {
            this.setState({loadError: e.message || '载入失败'});
        } finally {
            this.setState({loadingId: null});
        }
    };
    renderWorkItem = (p, showUpdate) => {
        const isLoading = this.state.loadingId === p.id;
        const author = p.author && (p.author.displayName || p.author.username || p.author.name);
        return (
            <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid #f0f0f0'
            }}>
                <div style={{flex: 1, minWidth: 0, marginRight: 10}}>
                    <div style={{
                        fontSize: 14, color: '#333',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{p.title}</div>
                    <div style={{fontSize: 11, color: '#999', marginTop: 2}}>
                        {CATEGORY_LABELS[p.category] || p.category || ''}
                        {author && <span style={{marginLeft: 8}}>· {author}</span>}
                        {p.views != null && <span style={{marginLeft: 8}}>· {p.views} 浏览</span>}
                    </div>
                </div>
                <div style={{flexShrink: 0}}>
                    <div style={{display: 'flex', gap: 6}}>
                        {this.props.showLoad && (
                            <button
                                style={{...btnGreen, opacity: isLoading ? 0.6 : 1}}
                                onClick={() => this.handleLoad(p)}
                                disabled={!!this.state.loadingId}
                            >
                                {isLoading ? '载入中…' : '载入'}
                            </button>
                        )}
                        {showUpdate && (
                            <button style={btn} onClick={() => this.props.onEdit && this.props.onEdit(p)}>
                                更新
                            </button>
                        )}
                        <button style={btnGhost} onClick={() => window.open(`https://forum.ctspace.xyz/projects/${p.id}`, '_blank')}>
                            查看
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    render () {
        if (!this.props.open) return null;
        const {
            tab, list, loading, error,
            exploreList, exploreLoading, exploreError,
            explorePage, exploreTotal, explorePageSize,
            loadError
        } = this.state;
        const exploreHasMore = explorePage * explorePageSize < exploreTotal;
        const exploreHasPrev = explorePage > 1;
        return (
            <div style={overlay} onMouseDown={(e) => {
                if (e.target === e.currentTarget && !this.state.loadingId && this.props.onClose) this.props.onClose();
            }}>
                <div style={card}>
                    {this.props.showExplore ? (
                        <div style={{display: 'flex', borderBottom: '1px solid #eee', marginBottom: 12}}>
                            <button style={tabStyle(tab === 'mine')} onClick={() => this.switchTab('mine')}>
                                我的作品
                            </button>
                            <button style={tabStyle(tab === 'explore')} onClick={() => this.switchTab('explore')}>
                                作品广场
                            </button>
                        </div>
                    ) : (
                        <div style={{fontSize: 16, fontWeight: 600, borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 12}}>
                            选择要更新的作品
                        </div>
                    )}
                    {loadError && (
                        <div style={{color: '#d93025', fontSize: 12, marginBottom: 8}}>{loadError}</div>
                    )}
                    {tab === 'mine' && (
                        <>
                            {loading && <div style={{fontSize: 13, color: '#888'}}>加载中…</div>}
                            {error && <div style={{color: '#d93025', fontSize: 13}}>{error}</div>}
                            {!loading && !error && list.length === 0 && (
                                <div style={{fontSize: 13, color: '#888'}}>还没有作品，去发布一个吧</div>
                            )}
                            <div style={{maxHeight: 360, overflowY: 'auto', marginTop: 6}}>
                                {list.map(p => this.renderWorkItem(p, true))}
                            </div>
                        </>
                    )}
                    {tab === 'explore' && this.props.showExplore && (
                        <>
                            {exploreLoading && <div style={{fontSize: 13, color: '#888'}}>加载中…</div>}
                            {exploreError && <div style={{color: '#d93025', fontSize: 13}}>{exploreError}</div>}
                            {!exploreLoading && !exploreError && exploreList.length === 0 && (
                                <div style={{fontSize: 13, color: '#888'}}>暂无作品</div>
                            )}
                            <div style={{maxHeight: 360, overflowY: 'auto', marginTop: 6}}>
                                {exploreList.map(p => this.renderWorkItem(p, false))}
                            </div>
                            {!exploreLoading && exploreList.length > 0 && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 12, marginTop: 12, fontSize: 12, color: '#888'
                                }}>
                                    <button
                                        style={{...btnGhost, opacity: exploreHasPrev ? 1 : 0.4}}
                                        onClick={() => exploreHasPrev && this.loadExplore(explorePage - 1)}
                                        disabled={!exploreHasPrev}
                                    >
                                        上一页
                                    </button>
                                    <span>第 {explorePage} 页 · 共 {exploreTotal} 个作品</span>
                                    <button
                                        style={{...btnGhost, opacity: exploreHasMore ? 1 : 0.4}}
                                        onClick={() => exploreHasMore && this.loadExplore(explorePage + 1)}
                                        disabled={!exploreHasMore}
                                    >
                                        下一页
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }
}

ForumMyWorksModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    onEdit: PropTypes.func,
    onLoad: PropTypes.func,
    showLoad: PropTypes.bool,
    showExplore: PropTypes.bool
};

ForumMyWorksModal.defaultProps = {
    showLoad: true,
    showExplore: true
};

export default ForumMyWorksModal;
