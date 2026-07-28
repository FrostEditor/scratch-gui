/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createProject, updateProject, uploadFile} from '../../lib/forum/index.js';

const overlay = {
    position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000
};
const card = {
    background: '#fff', borderRadius: 12, padding: '24px 28px', width: 400,
    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', fontFamily: 'inherit'
};
const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', marginTop: 6,
    marginBottom: 12, border: '1px solid #d9d9d9', borderRadius: 8, fontSize: 14, outline: 'none'
};
const btn = {
    width: '100%', padding: '10px', border: 'none', borderRadius: 8, fontSize: 14,
    fontWeight: 600, cursor: 'pointer', background: '#1a73e8', color: '#fff'
};

const CATEGORIES = [
    {value: 'game', label: '游戏'},
    {value: 'animation', label: '动画'},
    {value: 'story', label: '故事'},
    {value: 'music', label: '音乐'},
    {value: 'art', label: '美术'},
    {value: 'tutorial', label: '教程'},
    {value: 'other', label: '其他'}
];

class PublishProjectModal extends React.Component {
    constructor (props) {
        super(props);
        const proj = props.project;
        const raw = props.projectTitle;
        const defTitle = (raw && raw.title) || raw || (proj && proj.title) || '';
        this.state = {
            title: proj ? (proj.title || '') : defTitle,
            summary: proj ? (proj.summary || '') : '',
            category: proj ? (proj.category || 'game') : 'game',
            coverFile: null, coverPreview: null,
            loading: false, error: '', done: null, progress: ''
        };
    }
    chooseCover = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (this.state.coverPreview) URL.revokeObjectURL(this.state.coverPreview);
        this.setState({coverFile: f, coverPreview: URL.createObjectURL(f)});
    };
    publish = async () => {
        const {title, summary, category, coverFile} = this.state;
        if (!title.trim()) return this.setState({error: '请填写作品标题'});
        const vm = this.props.vm;
        if (!vm) return this.setState({error: '编辑器尚未就绪，请稍候'});

        this.setState({loading: true, error: '', progress: '正在导出当前作品…'});
        try {
            let data = await vm.saveProjectSb3();
            // 注意：saveProjectSb3() 返回的是 Blob，本身没有文件名。
            // 直接上传 Blob 时服务端收到的文件名是 "blob"（无 .sb3 扩展名），
            // 会被文件类型校验拒绝（暂不支持该文件类型）。必须包成带 .sb3 扩展名的 File。
            const sb3 = new File(
                [data],
                `${(title.trim() || 'project').replace(/[\\/:*?"<>|]/g, '_')}.sb3`,
                {type: 'application/x.scratch.sb3'}
            );

            this.setState({progress: '正在上传作品文件…'});
            const uploaded = await uploadFile(sb3);

            const body = {
                title: title.trim(),
                summary: summary.trim(),
                category,
                fileResourceId: uploaded.id
            };
            if (coverFile) {
                this.setState({progress: '正在上传封面…'});
                const cover = await uploadFile(coverFile);
                body.coverResourceId = cover.id;
            }

            this.setState({progress: this.props.project ? '正在更新作品…' : '正在发布到作品广场…'});
            const project = (this.props.project && this.props.project.id)
                ? await updateProject(this.props.project.id, body)
                : await createProject(body);
            this.setState({loading: false, progress: '', done: project});
            if (this.props.onPublished) this.props.onPublished(project);
        } catch (err) {
            this.setState({
                loading: false, progress: '',
                error: err.message || '发布失败，请重试'
            });
        }
    };
    render () {
        if (!this.props.open) return null;
        const {title, summary, category, coverPreview, loading, error, done, progress} = this.state;
        return (
            <div style={overlay} onMouseDown={(e) => {
                if (e.target === e.currentTarget && !loading && this.props.onClose) this.props.onClose();
            }}>
                <div style={card}>
                    <h3 style={{margin: '0 0 4px', fontSize: 18}}>{this.props.project ? '更新作品' : '发布作品'}</h3>
                    <p style={{margin: '0 0 14px', fontSize: 12, color: '#888'}}>
                        将当前作品发布到创客次元作品广场
                    </p>
                    {done ? (
                        <div>
                            <div style={{color: '#1a7f37', fontSize: 14, marginBottom: 10}}>
                                {this.props.project ? '更新成功！' : '发布成功！'}
                            </div>
                            <div style={{fontSize: 13, color: '#555', marginBottom: 14}}>
                                作品《{done.title || title}》已发布。
                            </div>
                            <button style={btn} onClick={() => {
                                if (done.id) window.open(`https://forum.ctspace.xyz/projects/${done.id}`, '_blank');
                                this.props.onClose && this.props.onClose();
                            }}>
                                查看作品
                            </button>
                        </div>
                    ) : (
                        <div>
                            <label style={{fontSize: 13, color: '#333'}}>标题</label>
                            <input
                                style={input} value={title}
                                onChange={(e) => this.setState({title: e.target.value})}
                                placeholder="给作品起个名字"
                            />
                            <label style={{fontSize: 13, color: '#333'}}>简介</label>
                            <textarea
                                style={{...input, minHeight: 64, resize: 'vertical'}}
                                value={summary}
                                onChange={(e) => this.setState({summary: e.target.value})}
                                placeholder="一句话介绍你的作品"
                            />
                            <label style={{fontSize: 13, color: '#333'}}>分类</label>
                            <select
                                style={input}
                                value={category}
                                onChange={(e) => this.setState({category: e.target.value})}
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <label style={{fontSize: 13, color: '#333'}}>封面（可选）</label>
                            <div style={{marginBottom: 12}}>
                                {coverPreview && (
                                    <img
                                        src={coverPreview}
                                        alt="cover"
                                        style={{width: 80, height: 60, objectFit: 'cover', borderRadius: 6, marginBottom: 6}}
                                    />
                                )}
                                <input type="file" accept="image/*" onChange={this.chooseCover} />
                            </div>
                            {error && (
                                <div style={{color: '#d93025', fontSize: 12, marginBottom: 8}}>{error}</div>
                            )}
                            {progress && (
                                <div style={{color: '#1a73e8', fontSize: 12, marginBottom: 8}}>{progress}</div>
                            )}
                            <button
                                style={{...btn, opacity: loading ? 0.6 : 1}}
                                onClick={this.publish}
                                disabled={loading}
                            >
                                {loading ? '发布中…' : '发布作品'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    projectTitle: state.scratchGui.projectTitle
});

PublishProjectModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    onPublished: PropTypes.func,
    vm: PropTypes.object,
    project: PropTypes.object,
    projectTitle: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
};

export default connect(mapStateToProps)(PublishProjectModal);
