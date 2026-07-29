import React from 'react';

// tw: 网易云歌曲添加弹窗。由 sound-tab 在“声音”标签里点击“添加网易云歌曲”时打开，
// 让用户输入网易云单曲链接，提交后由 sound-tab 负责真实下载并加入工程。

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
    animation: 'twNcFade 0.28s ease both'
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
    backgroundColor: '#000',
    color: '#fff'
};

const TwNeteaseSoundModal = function (props) {
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
            setError('请输入网易云歌曲链接');
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
                @keyframes twNcFade {
                    from { opacity: 0; transform: scale(0.94); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
            <div
                style={boxStyle}
                onClick={e => e.stopPropagation()}
            >
                <div style={titleStyle}>添加网易云歌曲</div>
                <div style={hintStyle}>
                    粘贴网易云音乐<strong>单曲分享链接</strong>（形如
                    <code> music.163.com/song?id=… </code>），
                    点击添加后将<strong>真实下载</strong>该歌曲并作为声音加入当前角色。
                    <br />
                    若提示需登录/下架，可在浏览器登录网易云后复制<strong>音频直链</strong>（.mp3 结尾的链接）直接粘贴此处下载；
                    或直接用「上传声音」导入本地音频文件。
                </div>
                <input
                    type="text"
                    style={inputStyle}
                    placeholder="https://music.163.com/song?id=1234567890"
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
                        取消
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

export default TwNeteaseSoundModal;
