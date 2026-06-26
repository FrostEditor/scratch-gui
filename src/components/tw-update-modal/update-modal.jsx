import React from 'react';
import { markVersionAsSeen } from '../../lib/update-checker';
import './update-modal.css';

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
    
    // 简单的 Markdown 解析（只处理标题、列表、粗体、链接）
    parseMarkdown(text) {
        if (!text) return '';
        
        let html = text
            // 标题
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // 粗体
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // 链接
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            // 无序列表
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            // 换行
            .replace(/\n/g, '<br/>');
        
        // 把连续的 li 包在 ul 里
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
            <div className="updateModalOverlay" onClick={this.handleClose}>
                <div className="updateModal" onClick={(e) => e.stopPropagation()}>
                    <div className="updateModalHeader">
                        <div className="updateModalTitle">
                            <span className="updateIcon">🎉</span>
                            <span>发现新版本</span>
                        </div>
                        <button className="updateModalClose" onClick={this.handleClose}>
                            ×
                        </button>
                    </div>
                    
                    <div className="updateModalBody">
                        <div className="updateVersionInfo">
                            <span className="updateVersionNumber">{version}</span>
                            {name && <span className="updateVersionName">{name}</span>}
                        </div>
                        
                        {publishedAt && (
                            <div className="updateDate">
                                发布时间：{this.formatDate(publishedAt)}
                            </div>
                        )}
                        
                        <div className="updateChangelog">
                            <h4>更新内容</h4>
                            <div 
                                className="updateChangelogContent"
                                dangerouslySetInnerHTML={{ __html: this.parseMarkdown(body) || '<p>暂无更新说明</p>' }}
                            />
                        </div>
                    </div>
                    
                    <div className="updateModalFooter">
                        <button className="updateSecondaryBtn" onClick={this.handleDontShowAgain}>
                            不再提示此版本
                        </button>
                        <a 
                            className="updatePrimaryBtn" 
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
