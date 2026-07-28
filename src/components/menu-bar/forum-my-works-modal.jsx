/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {myProjects} from '../../lib/forum/index.js';

const overlay = {
    position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000
};
const card = {
    background: '#fff', borderRadius: 12, padding: '24px 28px', width: 420,
    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', fontFamily: 'inherit'
};
const btn = {
    padding: '6px 14px', border: 'none', borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: 'pointer', background: '#1a73e8', color: '#fff'
};
const btnGhost = {
    padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', background: '#fff', color: '#333'
};

class ForumMyWorksModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {list: [], loading: true, error: ''};
    }
    componentDidMount () {
        if (this.props.open) this.load();
    }
    componentDidUpdate (prev) {
        if (this.props.open && !prev.open) this.load();
    }
    load = async () => {
        this.setState({loading: true, error: ''});
        try {
            const list = await myProjects();
            this.setState({list: Array.isArray(list) ? list : [], loading: false});
        } catch (e) {
            this.setState({error: e.message || '加载失败', loading: false});
        }
    };
    render () {
        if (!this.props.open) return null;
        const {list, loading, error} = this.state;
        return (
            <div style={overlay} onMouseDown={(e) => {
                if (e.target === e.currentTarget && this.props.onClose) this.props.onClose();
            }}>
                <div style={card}>
                    <h3 style={{margin: '0 0 4px', fontSize: 18}}>我的作品</h3>
                    <p style={{margin: '0 0 10px', fontSize: 12, color: '#888'}}>
                        创客次元作品广场 · 你的作品
                    </p>
                    {loading && <div style={{fontSize: 13, color: '#888'}}>加载中…</div>}
                    {error && <div style={{color: '#d93025', fontSize: 13}}>{error}</div>}
                    {!loading && !error && list.length === 0 && (
                        <div style={{fontSize: 13, color: '#888'}}>还没有作品，去发布一个吧</div>
                    )}
                    <div style={{maxHeight: 360, overflowY: 'auto', marginTop: 6}}>
                        {list.map(p => (
                            <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 0', borderBottom: '1px solid #f0f0f0'
                            }}>
                                <div>
                                    <div style={{fontSize: 14, color: '#333'}}>{p.title}</div>
                                    <div style={{fontSize: 12, color: '#999'}}>{p.category || ''}</div>
                                </div>
                                <div style={{display: 'flex', gap: 8}}>
                                    <button style={btn} onClick={() => this.props.onEdit && this.props.onEdit(p)}>
                                        更新
                                    </button>
                                    <button style={btnGhost} onClick={() => window.open(`https://forum.ctspace.xyz/projects/${p.id}`, '_blank')}>
                                        查看
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
}

ForumMyWorksModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    onEdit: PropTypes.func
};

export default ForumMyWorksModal;
