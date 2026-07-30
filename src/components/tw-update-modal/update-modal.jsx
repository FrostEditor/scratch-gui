import React from 'react';
import { markVersionAsSeen } from '../../lib/update-checker';
import styles from './update-modal.css';
import logo from '../../../static/images/512.png';

class UpdateModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isOpen: false,
            release: null
        };
    }
    
    componentDidMount() {
        // 监听显示更新日志的事件
        window.addEventListener('show-update-modal', this.handleShowModal);
    }
    
    componentWillUnmount() {
        window.removeEventListener('show-update-modal', this.handleShowModal);
    }
    
    handleShowModal = (e) => {
        this.setState({
            isOpen: true,
            release: e.detail?.release || null
        });
    };
    
    handleClose = () => {
        this.setState({ isOpen: false });
    };
    
    handleDontShowAgain = () => {
        if (this.state.release) {
            markVersionAsSeen(this.state.release.tag_name);
        }
        this.setState({ isOpen: false });
    };
    
    // 安全的 Markdown 解析（只处理标题、列表、粗体、链接）。
    //
    // 安全策略：先对全部输入做 HTML 实体转义，再套 markdown 正则。
    // 这样原始输入里的 <img onerror=...> 等会被转成 &lt;img...&gt; 当文本显示，
    // 只有 markdown 转换产生的已知安全标签（h1/h2/h3/strong/a/li/ul/br）才会进入 DOM。
    // 链接的 href 额外做协议白名单（仅 http/https/mailto），阻断 javascript: 注入。
    parseMarkdown(text) {
        if (!text) return '';

        // 1) 先转义所有 HTML 实体——这是防注入的关键步骤
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 2) 在已转义的文本上套 markdown 正则（只产生已知安全标签）
        html = html
            // 标题
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // 粗体
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // 链接：对 URL 做协议白名单，只允许 http(s)/mailto，其余降级为纯文本
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawUrl) => {
                const decoded = rawUrl
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'");
                if (/^(https?:|mailto:)/i.test(decoded)) {
                    return `<a href="${decoded}" target="_blank" rel="noopener noreferrer">${label}</a>`;
                }
                // 非白名单协议（javascript:、data: 等）：只保留链接文字，丢弃 URL
                return label;
            })
            // 无序列表
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            // 换行
            .replace(/\n/g, '<br/>');

        // 3) 把连续的 li 包在 ul 里
        html = html.replace(/(<li>.*<\/li>\s*)+/g, (match) => {
            return `<ul>${match}</ul>`;
        });

        return html;
    }
    
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    render() {
        if (!this.state.isOpen) return null;
        
        const { release } = this.state;
        const version = release?.tag_name || '未知版本';
        const name = release?.name || '';
        const body = release?.body || '';
        const publishedAt = release?.published_at || '';
        const htmlUrl = release?.html_url || '';
        
        return (
            <div className={styles.updateModalOverlay} onClick={this.handleClose}>
                <div className={styles.updateModal} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.updateModalHeader}>
                        <div className={styles.updateModalTitle}>
                            <img src={logo} alt="FrostEditor" className={styles.updateLogo} />
                            <div>
                                <div className={styles.updateTitleText}>发现新版本</div>
                                <div className={styles.updateSubtitle}>FrostEditor 更新日志</div>
                            </div>
                        </div>
                        <button className={styles.updateModalClose} onClick={this.handleClose}>
                            ×
                        </button>
                    </div>
                    
                    <div className={styles.updateModalBody}>
                        <div className={styles.updateVersionInfo}>
                            <span className={styles.updateVersionNumber}>{version}</span>
                            {name && <span className={styles.updateVersionName}>{name}</span>}
                        </div>
                        
                        {publishedAt && (
                            <div className={styles.updateDate}>
                                发布时间：{this.formatDate(publishedAt)}
                            </div>
                        )}
                        
                        <div className={styles.updateChangelog}>
                            <h4>更新内容</h4>
                            <div 
                                className={styles.updateChangelogContent}
                                dangerouslySetInnerHTML={{ __html: this.parseMarkdown(body) || '<p>暂无更新说明</p>' }}
                            />
                        </div>
                    </div>
                    
                    <div className={styles.updateModalFooter}>
                        <button className={styles.updateSecondaryBtn} onClick={this.handleDontShowAgain}>
                            不再提示此版本
                        </button>
                        <a 
                            className={styles.updatePrimaryBtn} 
                            href={htmlUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                        >
                            前往 GitHub 查看
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}

export default UpdateModal;
