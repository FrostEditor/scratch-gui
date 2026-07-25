import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';

// tw: 代码锁定模式的“强制打开编辑器”拦截。
// 当远程作品 URL 携带 ?lock（代码锁定）且有人**顶层直接打开 /editor.html（编辑器开发页）**时，
// 弹出警告并强制“退回”到根路径的播放页（去掉 URL 里的 editor.html 段）。
//
// 判定边界（依据用户的页面语义）：
//   - 根路径 `/?project_url=...` 视为“分享/播放页”，不弹窗。
//   - `/embed.html?...` 视为嵌入播放页，不弹窗（且已隐藏“在编辑器中打开”按钮）。
//   - 只有明确的 `/editor.html?...`（或路径形式 `/xxx/editor`）顶层直接打开才弹窗。
//   - 通过 <iframe> 嵌入（window.parent !== window）一律不弹窗，作者正常嵌入展示不受打扰。
const getPlayUrl = () => {
    const url = new URL(window.location.href);
    // /editor.html -> /    ； /123/editor -> /123
    url.pathname = url.pathname.replace(/\/editor\.html$/, '/').replace(/\/editor$/, '/');
    return url.href;
};

const TwCodeLockWarning = function (props) {
    const {
        codeLocked
    } = props;

    const [visible, setVisible] = React.useState(true);

    // 仅在：已锁定 + 顶层窗口（非 iframe 嵌入） + 路径为编辑器开发页 时弹窗
    const isEditorPage = /\/editor(\.html)?$/.test(window.location.pathname);
    if (!codeLocked || window.parent !== window || !isEditorPage) {
        return null;
    }
    if (!visible) {
        return null;
    }

    return (
        <div
            style={{
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
            }}
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    padding: '32px 36px',
                    maxWidth: 420,
                    width: 'calc(100% - 48px)',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
                    textAlign: 'center',
                    fontFamily: 'inherit'
                }}
            >
                <div
                    style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: '#d32f2f',
                        marginBottom: 16
                    }}
                >
                    警告
                </div>
                <div
                    style={{
                        fontSize: 16,
                        lineHeight: 1.6,
                        color: '#333',
                        marginBottom: 24
                    }}
                >
                    你个18码的艾斯贼，不要盗源码！
                </div>
                <button
                    type="button"
                    onClick={() => {
                        window.location.href = getPlayUrl();
                    }}
                    style={{
                        backgroundColor: '#2e7d32',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 28px',
                        fontSize: 15,
                        cursor: 'pointer'
                    }}
                >
                    返回
                </button>
            </div>
        </div>
    );
};

TwCodeLockWarning.propTypes = {
    codeLocked: PropTypes.bool
};

const mapStateToProps = state => ({
    codeLocked: state.scratchGui.tw.codeLocked
});

export default connect(mapStateToProps)(TwCodeLockWarning);
