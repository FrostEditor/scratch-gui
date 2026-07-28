/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {getCaptcha, solvePow, login, register, getMe} from '../../lib/forum/index.js';

// 根据错误给出确定中文（服务端中文 message 偶发 GBK 乱码，故优先按状态码兜底）
function errorMessage (err) {
    const status = err && err.status;
    if (!status) {
        return (err && err.message) ||
            '无法连接论坛服务：请确认已重启 npm start（修改 devServer 代理后必须重启开发服务器）。';
    }
    if (status === 400) return '验证码错误或未通过人机验证，请刷新验证码后重试';
    if (status === 401) return '用户名或密码错误';
    if (status === 403) return '当前凭证无权执行该操作';
    if (status === 429) return '操作过于频繁，请稍后再试';
    if (status >= 500) return '论坛服务器异常，请稍后再试';
    return (err && err.message) || '请求失败，请重试';
}

const overlay = {
    position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 2000
};
const card = {
    background: '#fff', borderRadius: 12, padding: '24px 28px', width: 360,
    maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', fontFamily: 'inherit'
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
const btnGhost = {
    border: '1px solid #d9d9d9', background: '#fff', color: '#333', borderRadius: 8,
    padding: '8px 12px', cursor: 'pointer', fontSize: 13
};

// 登录 / 注册弹窗。需人机验证：展示图文验证码，由 JS 自动完成 PoW，用户只需输入图片上的文字。
class ForumAuthModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            username: '', email: '', password: '', captchaAnswer: '',
            captcha: null, // { token, image, pow: { challenge, difficulty } }
            loadingCaptcha: false, loading: false,
            error: '', powStatus: ''
        };
    }
    componentDidMount () {
        if (this.props.open) this.loadCaptcha();
    }
    componentDidUpdate (prev) {
        if (this.props.open && !prev.open) {
            this.setState({
                username: '', email: '', password: '', captchaAnswer: '',
                captcha: null, error: '', powStatus: '', loading: false
            });
            this.loadCaptcha();
        }
    }
    loadCaptcha = async () => {
        this.setState({loadingCaptcha: true, error: ''});
        try {
            const c = await getCaptcha();
            this.setState({captcha: c, loadingCaptcha: false});
        } catch (e) {
            this.setState({error: errorMessage(e), loadingCaptcha: false});
        }
    };
    switchMode = () => {
        const next = this.props.mode === 'login' ? 'register' : 'login';
        this.props.onModeChange ? this.props.onModeChange(next) : null;
        this.setState({error: '', captchaAnswer: ''});
        this.loadCaptcha();
    };
    submit = async (e) => {
        e.preventDefault();
        const {username, email, password, captchaAnswer, captcha} = this.state;
        const mode = this.props.mode || 'login';
        if (!captcha) return this.setState({error: '验证码未加载'});
        if (!username.trim() || !password) return this.setState({error: '请输入账号和密码'});
        if (mode === 'register' && !email.trim()) return this.setState({error: '注册需填写邮箱'});
        if (!captchaAnswer.trim()) return this.setState({error: '请输入图片上的验证码'});

        this.setState({loading: true, error: '', powStatus: '正在计算人机验证…'});
        try {
            const powNonce = await solvePow(captcha.pow.challenge, captcha.pow.difficulty);
            const captchaData = {
                captchaToken: captcha.token,
                captchaAnswer: captchaAnswer.trim(),
                captchaPowNonce: powNonce
            };
            let res;
            if (mode === 'login') {
                res = await login({username: username.trim(), password, captcha: captchaData});
            } else {
                res = await register({
                    username: username.trim(), email: email.trim(), password, captcha: captchaData
                });
            }
            let user = res.user || res;
            if (!user || !user.id) {
                try {
                    user = await getMe();
                } catch (_) { /* ignore */ }
            }
            this.setState({loading: false, powStatus: ''});
            if (this.props.onSuccess) this.props.onSuccess(user || res);
        } catch (err) {
            this.setState({
                loading: false, powStatus: '',
                error: errorMessage(err),
                captchaAnswer: ''
            });
            this.loadCaptcha();
        }
    };
    render () {
        if (!this.props.open) return null;
        const {captcha, loading, loadingCaptcha, error, powStatus} = this.state;
        const mode = this.props.mode || 'login';
        return (
            <div style={overlay} onMouseDown={(e) => {
                if (e.target === e.currentTarget && this.props.onClose) this.props.onClose();
            }}>
                <div style={card}>
                    <h3 style={{margin: '0 0 4px', fontSize: 18}}>
                        {mode === 'login' ? '登录' : '注册新账号'}
                    </h3>
                    <p style={{margin: '0 0 14px', fontSize: 12, color: '#888'}}>
                        创客次元社区 · 铁元素编辑器
                    </p>
                    <form onSubmit={this.submit}>
                        <input
                            style={input} placeholder="用户名"
                            value={this.state.username}
                            onChange={(e) => this.setState({username: e.target.value})}
                        />
                        {mode === 'register' && (
                            <input
                                style={input} placeholder="邮箱" type="email"
                                value={this.state.email}
                                onChange={(e) => this.setState({email: e.target.value})}
                            />
                        )}
                        <input
                            style={input} placeholder="密码" type="password"
                            value={this.state.password}
                            onChange={(e) => this.setState({password: e.target.value})}
                        />
                        <div style={{marginBottom: 6}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                <div style={{
                                    flex: 1, border: '1px solid #d9d9d9', borderRadius: 8,
                                    padding: 4, height: 40, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    background: '#f7f7f7', overflow: 'hidden'
                                }}>
                                    {captcha && captcha.image ? (
                                        <img
                                            src={captcha.image}
                                            alt="captcha"
                                            style={{height: 36, maxWidth: '100%'}}
                                        />
                                    ) : (
                                        <span style={{fontSize: 12, color: '#999'}}>
                                            {loadingCaptcha ? '加载中…' : '无验证码'}
                                        </span>
                                    )}
                                </div>
                                <button type="button" style={btnGhost} onClick={this.loadCaptcha}>
                                    换一张
                                </button>
                            </div>
                            <input
                                style={{...input, marginTop: 8}}
                                placeholder="请输入图片上的文字"
                                value={this.state.captchaAnswer}
                                onChange={(e) => this.setState({captchaAnswer: e.target.value})}
                            />
                        </div>
                        {error && (
                            <div style={{color: '#d93025', fontSize: 12, marginBottom: 8}}>
                                {error}
                            </div>
                        )}
                        {powStatus && !error && (
                            <div style={{color: '#1a73e8', fontSize: 12, marginBottom: 8}}>
                                {powStatus}
                            </div>
                        )}
                        <button
                            type="submit"
                            style={{...btn, opacity: (loading ? 0.6 : 1)}}
                            disabled={loading}
                        >
                            {loading ? '处理中…' : (mode === 'login' ? '登录' : '注册')}
                        </button>
                    </form>
                    <div style={{marginTop: 12, fontSize: 13, textAlign: 'center'}}>
                        {mode === 'login' ? '还没有账号？' : '已有账号？'}
                        <span
                            style={{color: '#1a73e8', cursor: 'pointer', marginLeft: 4}}
                            onClick={this.switchMode}
                        >
                            {mode === 'login' ? '去注册' : '去登录'}
                        </span>
                    </div>
                </div>
            </div>
        );
    }
}

ForumAuthModal.propTypes = {
    open: PropTypes.bool,
    mode: PropTypes.string,
    onModeChange: PropTypes.func,
    onClose: PropTypes.func,
    onSuccess: PropTypes.func
};

export default ForumAuthModal;
