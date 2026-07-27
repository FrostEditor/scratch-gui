import React from 'react';

// tw: Bilibili 视频封面添加角色弹窗。由 target-pane 在“添加角色”菜单里点击
// “B站视频封面”时打开，让用户输入 B 站视频链接 / BV 号，提交后由 target-pane
// 负责真实下载封面并作为新角色加入工程。

const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6000
};
const boxStyle = {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: '26px 28px',
    maxWidth: 480,
    width: 'calc(100% - 48px)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    fontFamily: 'inherit',
    animation: 'twBiliFade 0.28s ease both'
};
const titleStyle = {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 6,
    color: '#1a1a1a'
};
const hintStyle = {
    fontSize: 13,
    color: '#888',
    lineHeight: 1.6,
    marginBottom: 14
};
const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: 8,
    border: '1px solid #d0d0d0',
    outline: 'none',
    fontFamily: 'inherit',
    color: '#333'
};
const errorStyle = {
    color: '#e53935',
    fontSize: 13,
    marginTop: 10,
    minHeight: 18,
    lineHeight: 1.5
};
const btnRowStyle = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18
};
const btnBase = {
    border: 'none',
    borderRadius: 8,
    padding: '9px 22px',
    fontSize: 14,
    cursor: 'pointer'
};
const cancelBtn = {
    ...btnBase,
    backgroundColor: '#eee',
    color: '#333'
};
const okBtn = {
    ...btnBase,
    backgroundColor: '#fb7299',
    color: '#fff'
};

const TwBilibiliSpriteModal = function (props) {
    const {
        onClose,
        onSubmit
    } = props;
    const [link, setLink] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const handleSubmit = async () => {
        const l = link.trim();
        if (!l) {
            setError('请输入 B 站视频链接或 BV 号');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await onSubmit(l);
            onClose();
        } catch (e) {
            setError(e && e.message ? e.message : '添加失败，请检查链接');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={overlayStyle}
            onClick={() => !loading && onClose()}
        >
            <style>{`
                @keyframes twBiliFade {
                    from { opacity: 0; transform: scale(0.94); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
            <div
                style={boxStyle}
                onClick={e => e.stopPropagation()}
            >
                <div style={titleStyle}>{'使用 Bilibili 视频封面'}</div>
                <div style={hintStyle}>
                    {'粘贴 B 站'}<strong>{'视频链接或 BV 号'}</strong>{'（形如 '}
                    <code>{'bilibili.com/video/BV… '}</code>{'或'}
                    <code>{' BV1xx411c7mD '}</code>{'），点击添加后将'}
                    <strong>{'下载该视频封面'}</strong>{'并作为新角色加入工程。'}
                    <br />
                    {'b23.tv 短链请先在浏览器打开，复制完整链接再粘贴。'}
                </div>
                <input
                    type="text"
                    style={inputStyle}
                    placeholder="https://www.bilibili.com/video/BV1xx411c7mD"
                    value={link}
                    autoFocus
                    disabled={loading}
                    onChange={e => setLink(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSubmit();
                    }}
                />
                <div style={errorStyle}>{error}</div>
                <div style={btnRowStyle}>
                    <button
                        type="button"
                        style={cancelBtn}
                        disabled={loading}
                        onClick={onClose}
                    >
                        {'取消'}
                    </button>
                    <button
                        type="button"
                        style={okBtn}
                        disabled={loading}
                        onClick={handleSubmit}
                    >
                        {loading ? '下载中…' : '添加'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TwBilibiliSpriteModal;
