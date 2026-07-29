/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createProject, updateProject, uploadFile, validateSb3Blob, setResourcePublic} from '../../lib/forum/index.js';
import AnimatedModal from './animated-modal.jsx';

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

        console.log('[发布] ===== 开始 =====', {
            title: title.trim(),
            hasVm: !!vm,
            hasSaveProjectSb3: typeof (vm && vm.saveProjectSb3),
            isUpdate: Boolean(this.props.project && this.props.project.id)
        });
        this.setState({loading: true, error: '', progress: '正在导出当前作品…'});
        try {
            // sb3 文件名：优先使用编辑器菜单栏「作品名称」输入框的内容（与「保存到电脑」一致），
            // 回退到弹窗标题，避免出现乱码文件名。去掉可能自带的 .sb3 后缀，统一追加一次。
            const rawWork = (typeof this.props.projectTitle === 'string' && this.props.projectTitle.trim()) ||
                (title && title.trim()) || 'project';
            const workName = rawWork.replace(/\.sb3$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'project';
            const baseName = `${workName}.sb3`;
            console.log('[发布] 文件名 =', baseName, '（来源作品名称=', rawWork, '）');
            // 与「保存到电脑 / 保存作品」完全一致的生成方式：saveProjectSb3() 默认返回合法 zip Blob。
            console.log('[发布] 调用 vm.saveProjectSb3() …');
            const blob = await vm.saveProjectSb3();
            console.log('[发布] saveProjectSb3 返回', {type: blob && blob.type, size: blob && blob.size, isBlob: blob instanceof Blob});
            // 打印前 4 字节，确认 ZIP 魔数 PK\x03\x04
            const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
            const isPk = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
            console.log('[发布] 文件头(hex) =', Array.from(head).map(b => b.toString(16).padStart(2, '0')).join(' '), '是合法 ZIP(PK)=', isPk);
            const sb3 = new File([blob], baseName, {type: 'application/x.scratch.sb3'});
            console.log('[发布] 包装为 File', {name: sb3.name, size: sb3.size, type: sb3.type});

            // 上传前校验：确保是合法 SB3（zip + meta.semver），与 Turbowarp 嵌入校验口径一致。
            this.setState({progress: '正在校验作品文件…'});
            const valid = await validateSb3Blob(sb3);
            console.log('[发布] validateSb3Blob 结果 =', valid);
            if (!valid.ok) throw new Error(valid.error);

            this.setState({progress: '正在上传作品文件…'});
            console.log('[发布] 调用 uploadFile …');
            const uploaded = await uploadFile(sb3);
            console.log('[发布] uploadFile 返回 =', uploaded);
            // 作品广场作品需匿名（如 Turbowarp 嵌入）可下载，关闭「需要登录」。
            setResourcePublic(uploaded.id)
                .then(r => console.log('[发布] setResourcePublic 返回 =', r))
                .catch(e => console.warn('[发布] setResourcePublic 失败（不影响发布）', e));

            const isUpdate = Boolean(this.props.project && this.props.project.id);
            const body = {
                title: title.trim(),
                summary: summary.trim(),
                category
            };
            // 创建用 fileResourceId；更新【必须】用 newFileResourceId（对照论坛前端 JS 逆向确认：
            // 服务端对 PATCH 里的 fileResourceId 会直接忽略，只有 newFileResourceId 才真正换文件，
            // 且需配合 changelog 才会新增一个版本；coverResourceId 创建/更新通用）。
            if (isUpdate) {
                body.newFileResourceId = uploaded.id;
                body.changelog = '更新作品内容';
            } else {
                body.fileResourceId = uploaded.id;
            }
            // 封面：仅使用用户手动选择的封面（不再自动截取舞台画面当封面，避免随机/自动图片）。
            // 更新作品模式下未重新选封面则不发送 coverResourceId，保留作品原有封面。
            const coverToUpload = coverFile;
            if (coverToUpload) {
                this.setState({progress: '正在上传封面…'});
                const cover = await uploadFile(coverToUpload);
                body.coverResourceId = cover.id;
                setResourcePublic(cover.id).catch(() => {});
            }

            this.setState({progress: isUpdate ? '正在更新作品…' : '正在发布到作品广场…'});
            console.log('[发布] 调用', isUpdate ? 'updateProject' : 'createProject', body);
            const project = isUpdate
                ? await updateProject(this.props.project.id, body)
                : await createProject(body);
            console.log('[发布] ✅ 成功 =', project);
            this.setState({loading: false, progress: '', done: project});
            if (this.props.onPublished) this.props.onPublished(project);
        } catch (err) {
            console.error('[发布] ❌ 失败', err);
            console.error('[发布] 失败详情', {
                message: err && err.message,
                status: err && err.status,
                data: err && err.data,
                stack: err && err.stack
            });
            const detail = (err && err.message) || '发布失败，请重试';
            const statusText = (err && err.status) ? `（HTTP ${err.status}）` : '';
            this.setState({
                loading: false, progress: '',
                error: `${detail}${statusText}`
            });
        }
    };
    render () {
        const {title, summary, category, coverPreview, loading, error, done, progress} = this.state;
        return (
            <AnimatedModal
                open={this.props.open}
                overlay={overlay}
                card={card}
                onOverlayClick={(e) => {
                    if (e.target === e.currentTarget && !loading && this.props.onClose) this.props.onClose();
                }}
            >
                <h3 style={{margin: '0 0 4px', fontSize: 18}}>{this.props.project ? '更新作品' : '发布作品'}</h3>
                <p style={{margin: '0 0 14px', fontSize: 12, color: '#888'}}>
                    将当前作品发布到创客次元作品广场
                </p>
                {done ? (
                    <div className="fe-success-pop">
                        <div className="fe-success-check">✓</div>
                        <div style={{color: '#1a7f37', fontSize: 15, fontWeight: 600, marginBottom: 8}}>
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
                                {loading ? (this.props.project ? '更新中…' : '发布中…') : (this.props.project ? '更新作品' : '发布作品')}
                            </button>
                        </div>
                    )}
            </AnimatedModal>
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
