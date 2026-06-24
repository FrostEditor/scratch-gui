import React from 'react';
import PropTypes from 'prop-types';
import styles from './project-statement.css';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';

class ProjectStatement extends React.Component {
    constructor (props) {
        super(props);
        
        // 从 localStorage 读取作品声明
        const savedStatement = localStorage.getItem('projectStatement') || '';
        
        this.state = {
            statement: savedStatement,
            isCollaborating: false,
            remoteUser: ''
        };
        
        this.handleChange = this.handleChange.bind(this);
        this.handleStatementUpdated = this.handleStatementUpdated.bind(this);
        this.handleCollaborationConnected = this.handleCollaborationConnected.bind(this);
        this.handleCollaborationDisconnected = this.handleCollaborationDisconnected.bind(this);
        
        // 防抖定时器
        this._syncDebounceTimer = null;
    }
    
    componentDidMount() {
        // 监听作品声明更新
        collaborationManager.on('statement-updated', this.handleStatementUpdated);
        
        // 监听协作状态
        collaborationManager.on('connected', this.handleCollaborationConnected);
        collaborationManager.on('disconnected', this.handleCollaborationDisconnected);
        collaborationManager.on('room-joined', this.handleCollaborationConnected);
        collaborationManager.on('room-created', this.handleCollaborationConnected);
        
        // 检查初始状态
        if (collaborationManager.isConnected && collaborationManager.roomKey) {
            this.setState({ isCollaborating: true });
        }
    }
    
    componentWillUnmount() {
        // 移除事件监听
        collaborationManager.off('statement-updated', this.handleStatementUpdated);
        collaborationManager.off('connected', this.handleCollaborationConnected);
        collaborationManager.off('disconnected', this.handleCollaborationDisconnected);
        collaborationManager.off('room-joined', this.handleCollaborationConnected);
        collaborationManager.off('room-created', this.handleCollaborationConnected);
        
        // 清除定时器
        if (this._syncDebounceTimer) {
            clearTimeout(this._syncDebounceTimer);
        }
    }
    
    handleCollaborationConnected() {
        this.setState({ isCollaborating: true });
    }
    
    handleCollaborationDisconnected() {
        this.setState({ isCollaborating: false, remoteUser: '' });
    }
    
    handleStatementUpdated(data) {
        // 应用远程更新
        this.setState({ 
            statement: data.text,
            remoteUser: data.username || '对方'
        });
        // 保存到 localStorage
        localStorage.setItem('projectStatement', data.text);
    }
    
    handleChange (e) {
        const value = e.target.value;
        this.setState({ statement: value });
        // 自动保存到 localStorage
        localStorage.setItem('projectStatement', value);
        
        // 如果处于协作状态，发送同步（防抖 300ms）
        if (collaborationManager.isConnected && collaborationManager.roomKey) {
            if (this._syncDebounceTimer) {
                clearTimeout(this._syncDebounceTimer);
            }
            this._syncDebounceTimer = setTimeout(() => {
                collaborationManager.sendStatementUpdate(value);
            }, 300);
        }
    }
    
    render () {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2>作品声明 / 使用说明</h2>
                    <p className={styles.description}>
                        在这里编写你的作品说明、使用方法、注意事项等内容。
                        <br />
                        内容会自动保存到本地。
                        {this.state.isCollaborating && (
                            <span className={styles.syncStatus}>
                                {' '}· 协作同步中
                            </span>
                        )}
                    </p>
                </div>
                <div className={styles.editor}>
                    <textarea
                        className={styles.textarea}
                        placeholder="在这里输入作品使用说明、操作指南、声明等内容..."
                        value={this.state.statement}
                        onChange={this.handleChange}
                    />
                </div>
                <div className={styles.footer}>
                    <span className={styles.charCount}>
                        字数：{this.state.statement.length}
                    </span>
                    {this.state.isCollaborating && (
                        <span className={styles.syncIndicator}>
                            🔄 实时同步
                        </span>
                    )}
                </div>
            </div>
        );
    }
}

ProjectStatement.propTypes = {
    vm: PropTypes.shape({})
};

export default ProjectStatement;
