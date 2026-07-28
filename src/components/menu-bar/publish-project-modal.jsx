/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createProject, updateProject, uploadFile, validateSb3Blob, setResourcePublic} from '../../lib/forum/index.js';

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
    marginBottom: 12, border: '1px solid #d9d9d9', borderRadius: 8, fontSize: 14,
    outline: 'none',
    background: '#fff', color: '#222' /* 显式白底深字，避免深色主题下输入框变黑与白弹窗冲突 */
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

// 截取当前舞台画面作为封面图（PNG）。
// 论坛作品广场在缺封面时会显示「未收到图片」缺图占位，因此发布时若用户未手动选封面，
// 自动用舞台快照当封面，保证每个发布的作品都有缩略图。
function captureStageThumbnail (vm) {
    return new Promise((resolve, reject) => {
        const renderer = vm && vm.runtime && vm.runtime.renderer;
        if (!renderer || typeof renderer.requestSnapshot !== 'function') {
            return reject(new Error('renderer 不可用，无法截取舞台'));
        }
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) { settled = true; reject(new Error('截取舞台画面超时')); }
        }, 2000);
        renderer.requestSnapshot((dataUri) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                const base64 = String(dataUri).split(',')[1];
                if (!base64) throw new Error('快照数据为空');
                const bin = atob(base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const blob = new Blob([bytes], {type: 'image/png'});
                resolve(new File([blob], 'stage-thumbnail.png', {type: 'image/png'}));
            } catch (e) {
                reject(e);
            }
        });
    });
}

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
            sb3File: null, sb3Name: '',
            loading: false, error: '', done: null, progress: ''
        };
    }
    chooseCover = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (this.state.coverPreview) URL.revokeObjectURL(this.state.coverPreview);
        this.setState({coverFile: f, coverPreview: URL.createObjectURL(f)});
    };
    chooseSb3 = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        this.setState({sb3File: f, sb3Name: f.name});
    };
    publish = async () => {
        const {title, summary, category, coverFile} = this.state;
        if (!title.trim()) return this.setState({error: '请填写作品标题'});
        const vm = this.props.vm;
        if (!vm) return this.setState({error: '编辑器尚未就绪，请稍候'});

        this.setState({loading: true, error: '', progress: this.state.sb3File ? '正在校验所选 SB3 文件…' : '正在导出当前作品…'});
        try {
            const baseName = `${(title.trim() || 'project').replace(/[\\/:*?"<>|]/g, '_')}.sb3`;
            let sb3;
            if (this.state.sb3File) {
                // 用户直接选择了本地 SB3 文件：直接用它，跳过 saveProjectSb3 现场生成。
                // 部分情况下 saveProjectSb3 生成的 Blob 经 File 包装后字节异常，直接上传原文件最稳妥。
                sb3 = this.state.sb3File;
            } else {
                // 注意：saveProjectSb3() 默认返回 Blob；这里显式传 'arraybuffer' 取字节数组，
                // 再包成带 .sb3 扩展名的 File，避免「File 内嵌 JSZip Blob」在读取 arrayBuffer 时字节异常。
                const data = await vm.saveProjectSb3('arraybuffer');
                sb3 = new File([data], baseName, {type: 'application/x.scratch.sb3'});
            }

            // 上传前校验：确保是合法 SB3（zip + meta.semver），与 Turbowarp 嵌入校验口径一致。
            this.setState({progress: '正在校验作品文件…'});
            const valid = await validateSb3Blob(sb3);
            if (!valid.ok) throw new Error(valid.error);

            this.setState({progress: '正在上传作品文件…'});
            const uploaded = await uploadFile(sb3);
            // 作品广场作品需匿名（如 Turbowarp 嵌入）可下载，关闭「需要登录」。
            setResourcePublic(uploaded.id).catch(() => {});

            const body = {
                title: title.trim(),
                summary: summary.trim(),
                category,
                fileResourceId: uploaded.id
            };
            // 封面：用户已选则用用户选的；新建发布且未选封面时，自动截取舞台画面当封面，
            // 避免发布到作品广场后显示「未收到图片」缺图占位。
            // 更新作品模式下未重新选封面则不发送 coverResourceId，保留作品原有封面。
            let coverToUpload = coverFile;
            const isUpdate = Boolean(this.props.project && this.props.project.id);
            if (!coverToUpload && !isUpdate) {
                try {
                    this.setState({progress: '正在截取舞台画面作为封面…'});
                    coverToUpload = await captureStageThumbnail(vm);
                } catch (e) {
                    console.warn('[发布] 自动截取封面失败，将不传封面：', e);
                }
            }
            if (coverToUpload) {
                this.setState({progress: '正在上传封面…'});
                const cover = await uploadFile(coverToUpload);
                body.coverResourceId = cover.id;
                setResourcePublic(cover.id).catch(() => {});
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
        const {title, summary, category, coverPreview, sb3Name, loading, error, done, progress} = this.state;
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
                            <label style={{fontSize: 13, color: '#333'}}>SB3 文件（可选）</label>
                            <div style={{marginBottom: 12, fontSize: 12, color: '#666'}}>
                                <input type="file" accept=".sb3" onChange={this.chooseSb3} />
                                {sb3Name && (
                                    <div style={{marginTop: 4, color: '#1a73e8'}}>已选择：{sb3Name}</div>
                                )}
                                <div style={{marginTop: 2, fontSize: 11, color: '#999'}}>
                                    留空则自动发布当前作品；若自动导出的文件无效，可在此手动选择本地 .sb3 文件
                                </div>
                            </div>
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
