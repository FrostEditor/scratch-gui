import React from 'react';

// tw: 更新日志弹窗。从 GitHub 最新 Release 自动拉取更新说明，居中弹出显示。
// 仅在「有新的 Release 且用户未查看过该版本」时自动弹出；关闭后按 tag 记住，不重复打扰。
// 内容源：https://api.github.com/repos/FrostEditor/scratch-gui/releases/latest
// 注意：GitHub API 对未认证请求有速率限制（60 次/小时/IP），失败则静默不弹，不影响编辑器。

const REPO = 'FrostEditor/scratch-gui';
const STORAGE_KEY = 'tw:readRelease';

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
    zIndex: 6000,
    animation: 'twNewsFade 0.22s ease both'
};
const boxStyle = {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    maxWidth: 560,
    width: 'calc(100% - 48px)',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    fontFamily: 'inherit',
    animation: 'twNewsPop 0.34s cubic-bezier(0.16, 1, 0.3, 1) both'
};
const headerStyle = {
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: 1,
    marginBottom: 6,
    // tw: 非线性金色渐变（非均匀色标）
    background:
        'linear-gradient(92deg, #bf953f 0%, #fcf6ba 26%, #b38728 46%, #fbf5b7 66%, #aa771c 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent'
};
const versionStyle = {
    fontSize: 14,
    color: '#888',
    marginBottom: 14
};
const bodyStyle = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowY: 'auto',
    fontSize: 14,
    lineHeight: 1.7,
    color: '#333',
    margin: 0,
    flex: 1
};
const buttonStyle = {
    marginTop: 18,
    alignSelf: 'flex-end',
    backgroundColor: '#000',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 26px',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background-color 0.18s ease, transform 0.18s ease'
};
// tw: 悬停时略微提亮，保持黑底白字
const buttonHoverStyle = {
    backgroundColor: '#222'
};

const TWNews = function () {
    const [visible, setVisible] = React.useState(false);
    const [version, setVersion] = React.useState('');
    const [body, setBody] = React.useState('');
    const [tag, setTag] = React.useState('');
    const [hover, setHover] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
            .then(res => {
                if (!res.ok) {
                    throw new Error('fetch failed');
                }
                return res.json();
            })
            .then(data => {
                if (cancelled) {
                    return;
                }
                let readTag = '';
                try {
                    readTag = localStorage.getItem(STORAGE_KEY) || '';
                } catch (e) {
                    // ignore
                }
                if (data && data.tag_name && data.tag_name !== readTag) {
                    setTag(data.tag_name);
                    setVersion(data.name || data.tag_name || '');
                    setBody(data.body || '（暂无更新说明）');
                    setVisible(true);
                }
            })
            .catch(() => {
                // 静默失败：限流或网络问题时不弹窗，不影响编辑器正常加载
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!visible) {
        return null;
    }

    const handleClose = () => {
        setVisible(false);
        try {
            localStorage.setItem(STORAGE_KEY, tag);
        } catch (e) {
            // ignore
        }
    };

    return (
        <div
            style={overlayStyle}
            onClick={handleClose}
        >
            <style>{`
                @keyframes twNewsFade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes twNewsPop {
                    from { opacity: 0; transform: scale(0.88) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
            <div
                style={boxStyle}
                onClick={e => e.stopPropagation()}
            >
                <div style={headerStyle}>更新日志</div>
                {version ? (
                    <div style={versionStyle}>{version}</div>
                ) : null}
                <pre style={bodyStyle}>{body}</pre>
                <button
                    type="button"
                    style={hover ? {...buttonStyle, ...buttonHoverStyle} : buttonStyle}
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                    onClick={handleClose}
                >
                    我知道了
                </button>
            </div>
        </div>
    );
};

export default TWNews;
