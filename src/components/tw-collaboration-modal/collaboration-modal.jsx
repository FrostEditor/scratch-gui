import {defineMessages, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import styles from './collaboration-modal.css';

const messages = defineMessages({
    title: {
        defaultMessage: '多人协作',
        description: 'Title of collaboration modal',
        id: 'tw.collaboration.title'
    },
    createRoom: {
        defaultMessage: '创建房间',
        description: 'Button to create a new room',
        id: 'tw.collaboration.createRoom'
    },
    joinRoom: {
        defaultMessage: '加入房间',
        description: 'Button to join a room',
        id: 'tw.collaboration.joinRoom'
    },
    roomKey: {
        defaultMessage: '房间密钥',
        description: 'Label for room key',
        id: 'tw.collaboration.roomKey'
    },
    copy: {
        defaultMessage: '复制',
        description: 'Button to copy room key',
        id: 'tw.collaboration.copy'
    },
    copied: {
        defaultMessage: '已复制',
        description: 'Message when room key is copied',
        id: 'tw.collaboration.copied'
    },
    enterRoomKey: {
        defaultMessage: '请输入房间密钥',
        description: 'Placeholder for room key input',
        id: 'tw.collaboration.enterRoomKey'
    },
    join: {
        defaultMessage: '加入',
        description: 'Button to confirm join',
        id: 'tw.collaboration.join'
    },
    back: {
        defaultMessage: '返回',
        description: 'Button to go back',
        id: 'tw.collaboration.back'
    },
    close: {
        defaultMessage: '关闭',
        description: 'Button to close the modal',
        id: 'tw.collaboration.close'
    },
    members: {
        defaultMessage: '房间成员',
        description: 'Label for room members list',
        id: 'tw.collaboration.members'
    },
    host: {
        defaultMessage: '房主',
        description: 'Label for room host',
        id: 'tw.collaboration.host'
    },
    kick: {
        defaultMessage: '移出',
        description: 'Button to kick a member',
        id: 'tw.collaboration.kick'
    },
    leaveRoom: {
        defaultMessage: '离开房间',
        description: 'Button to leave the room',
        id: 'tw.collaboration.leaveRoom'
    },
    you: {
        defaultMessage: '（你）',
        description: 'Label for current user',
        id: 'tw.collaboration.you'
    },
    connecting: {
        defaultMessage: '连接中...',
        description: 'Connecting status',
        id: 'tw.collaboration.connecting'
    },
    disconnected: {
        defaultMessage: '未连接',
        description: 'Disconnected status',
        id: 'tw.collaboration.disconnected'
    },
    connected: {
        defaultMessage: '已连接',
        description: 'Connected status',
        id: 'tw.collaboration.connected'
    },
    error: {
        defaultMessage: '错误',
        description: 'Error label',
        id: 'tw.collaboration.error'
    },
    serverUrl: {
        defaultMessage: '服务器地址',
        description: 'Server URL label',
        id: 'tw.collaboration.serverUrl'
    },
    username: {
        defaultMessage: '用户名',
        description: 'Username label',
        id: 'tw.collaboration.username'
    },
    description: {
        defaultMessage: '与朋友一起实时协作编辑项目',
        description: 'Description of collaboration feature',
        id: 'tw.collaboration.description'
    }
});

const CollaborationModal = props => {
    const [view, setView] = useState('main'); // main, create, join, room
    const [roomKey, setRoomKey] = useState('');
    const [inputKey, setInputKey] = useState('');
    const [copied, setCopied] = useState(false);
    const [members, setMembers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected
    const [error, setError] = useState('');
    const [serverUrl, setServerUrl] = useState('https://server.froste.top');
    const [username, setUsername] = useState('用户');
    const [isLoading, setIsLoading] = useState(false);
    
    const isMounted = useRef(true);

    // 组件挂载时监听事件
    useEffect(() => {
        isMounted.current = true;

        const handleConnected = () => {
            if (!isMounted.current) return;
            setStatus('connected');
            setError('');
        };

        const handleDisconnected = () => {
            if (!isMounted.current) return;
            setStatus('disconnected');
            setView('main');
            setRoomKey('');
            setMembers([]);
            setIsHost(false);
        };

        const handleError = (data) => {
            if (!isMounted.current) return;
            setError(data.message || data.reason || '未知错误');
            setIsLoading(false);
        };

        const handleMembersUpdated = (newMembers) => {
            if (!isMounted.current) return;
            setMembers(newMembers);
        };

        const handleKicked = (data) => {
            if (!isMounted.current) return;
            setError(data.reason || '你被移出了房间');
            setView('main');
            setRoomKey('');
            setMembers([]);
            setIsHost(false);
        };

        collaborationManager.on('connected', handleConnected);
        collaborationManager.on('disconnected', handleDisconnected);
        collaborationManager.on('error', handleError);
        collaborationManager.on('members-updated', handleMembersUpdated);
        collaborationManager.on('kicked', handleKicked);

        // 检查当前状态
        if (collaborationManager.isConnected) {
            setStatus('connected');
            if (collaborationManager.roomKey) {
                setRoomKey(collaborationManager.roomKey);
                setIsHost(collaborationManager.isHost);
                setMembers(collaborationManager.members);
                setView('room');
            }
        }

        // 从 localStorage 读取服务器地址
        const savedServerUrl = localStorage.getItem('collaborationServerUrl');
        if (savedServerUrl) {
            setServerUrl(savedServerUrl);
        }

        // 从 localStorage 读取用户名
        const savedUsername = localStorage.getItem('collaborationUsername');
        if (savedUsername) {
            setUsername(savedUsername);
            collaborationManager.setUsername(savedUsername);
        }

        return () => {
            isMounted.current = false;
            collaborationManager.off('connected', handleConnected);
            collaborationManager.off('disconnected', handleDisconnected);
            collaborationManager.off('error', handleError);
            collaborationManager.off('members-updated', handleMembersUpdated);
            collaborationManager.off('kicked', handleKicked);
        };
    }, []);

    // 保存服务器地址
    const saveServerUrl = (url) => {
        localStorage.setItem('collaborationServerUrl', url);
    };

    // 保存用户名
    const saveUsername = (name) => {
        localStorage.setItem('collaborationUsername', name);
        collaborationManager.setUsername(name);
    };

    // 创建房间
    const handleCreateRoom = async () => {
        setError('');
        setIsLoading(true);
        setStatus('connecting');

        try {
            saveServerUrl(serverUrl);
            saveUsername(username);
            
            const result = await collaborationManager.createRoom(serverUrl);
            setRoomKey(result.roomKey);
            setIsHost(result.isHost);
            setMembers(result.members);
            setView('room');
            setStatus('connected');
        } catch (e) {
            setError(e.message || '创建房间失败');
            setStatus('disconnected');
        } finally {
            setIsLoading(false);
        }
    };

    // 加入房间
    const handleJoinRoom = async () => {
        if (!inputKey.trim()) {
            setError('请输入房间密钥');
            return;
        }

        setError('');
        setIsLoading(true);
        setStatus('connecting');

        try {
            saveServerUrl(serverUrl);
            saveUsername(username);
            
            const result = await collaborationManager.joinRoom(inputKey, serverUrl);
            setRoomKey(result.roomKey);
            setIsHost(result.isHost);
            setMembers(result.members);
            setView('room');
            setStatus('connected');
        } catch (e) {
            setError(e.message || '加入房间失败');
            setStatus('disconnected');
        } finally {
            setIsLoading(false);
        }
    };

    // 复制房间密钥
    const handleCopyKey = () => {
        navigator.clipboard.writeText(roomKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 离开房间
    const handleLeaveRoom = () => {
        collaborationManager.leaveRoom();
        setView('main');
        setRoomKey('');
        setMembers([]);
        setIsHost(false);
        setStatus('disconnected');
    };

    // 踢出成员
    const handleKickMember = (memberId) => {
        if (window.confirm('确定要移出这个成员吗？')) {
            collaborationManager.kickMember(memberId);
        }
    };

    // 渲染主界面
    const renderMainView = () => (
        <div className={styles.mainView}>
            <p className={styles.description}>
                {props.intl.formatMessage(messages.description)}
            </p>

            {/* 服务器地址设置 */}
            <div className={styles.serverSettings}>
                <label className={styles.serverLabel}>
                    {props.intl.formatMessage(messages.serverUrl)}
                </label>
                <input
                    type="text"
                    className={styles.serverInput}
                    value={serverUrl}
                    onChange={e => setServerUrl(e.target.value)}
                    placeholder="https://your-worker.workers.dev"
                />
                <div className={styles.statusIndicator}>
                    <span className={`${styles.statusDot} ${styles[status]}`}></span>
                    <span className={styles.statusText}>
                        {status === 'connected' 
                            ? props.intl.formatMessage(messages.connected)
                            : status === 'connecting'
                            ? props.intl.formatMessage(messages.connecting)
                            : props.intl.formatMessage(messages.disconnected)
                        }
                    </span>
                </div>
            </div>

            {/* 用户名设置 */}
            <div className={styles.serverSettings}>
                <label className={styles.serverLabel}>
                    {props.intl.formatMessage(messages.username)}
                </label>
                <input
                    type="text"
                    className={styles.serverInput}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="输入你的用户名"
                    maxLength={20}
                />
            </div>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.buttonGroup}>
                <button
                    className={styles.primaryButton}
                    onClick={handleCreateRoom}
                    disabled={isLoading}
                >
                    {isLoading ? '创建中...' : props.intl.formatMessage(messages.createRoom)}
                </button>
                <button
                    className={styles.secondaryButton}
                    onClick={() => {
                        setError('');
                        setView('join');
                    }}
                    disabled={isLoading}
                >
                    {props.intl.formatMessage(messages.joinRoom)}
                </button>
            </div>
        </div>
    );

    // 渲染加入房间界面
    const renderJoinView = () => (
        <div className={styles.joinView}>
            <button
                className={styles.backButton}
                onClick={() => {
                    setError('');
                    setView('main');
                }}
            >
                ← {props.intl.formatMessage(messages.back)}
            </button>
            <h3 className={styles.subtitle}>
                {props.intl.formatMessage(messages.joinRoom)}
            </h3>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                    {props.intl.formatMessage(messages.roomKey)}
                </label>
                <input
                    type="text"
                    className={styles.roomKeyInput}
                    placeholder={props.intl.formatMessage(messages.enterRoomKey)}
                    value={inputKey}
                    onChange={e => setInputKey(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={isLoading}
                />
            </div>
            <button
                className={styles.primaryButton}
                onClick={handleJoinRoom}
                disabled={!inputKey.trim() || isLoading}
            >
                {isLoading ? '加入中...' : props.intl.formatMessage(messages.join)}
            </button>
        </div>
    );

    // 渲染房间界面
    const renderRoomView = () => (
        <div className={styles.roomView}>
            <div className={styles.roomHeader}>
                <div className={styles.roomKeyDisplay}>
                    <span className={styles.roomKeyLabel}>
                        {props.intl.formatMessage(messages.roomKey)}:
                    </span>
                    <span className={styles.roomKeyValue}>{roomKey}</span>
                    <button
                        className={styles.copyButton}
                        onClick={handleCopyKey}
                    >
                        {copied 
                            ? props.intl.formatMessage(messages.copied)
                            : props.intl.formatMessage(messages.copy)
                        }
                    </button>
                </div>
                <div className={styles.syncStatus}>
                    <span className={`${styles.statusDot} ${styles.connected}`}></span>
                    <span className={styles.statusText}>实时同步中</span>
                </div>
            </div>

            <div className={styles.membersSection}>
                <h4 className={styles.membersTitle}>
                    {props.intl.formatMessage(messages.members)} ({members.length})
                </h4>
                <div className={styles.membersList}>
                    {members.map(member => (
                        <div key={member.id} className={styles.memberItem}>
                            <div className={styles.memberInfo}>
                                <div className={styles.memberAvatar}>
                                    {member.username.charAt(0)}
                                </div>
                                <div className={styles.memberName}>
                                    {member.username}
                                    {member.id === collaborationManager.memberId && (
                                        <span className={styles.youLabel}>
                                            {props.intl.formatMessage(messages.you)}
                                        </span>
                                    )}
                                    {member.isHost && (
                                        <span className={styles.hostBadge}>
                                            {props.intl.formatMessage(messages.host)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {isHost && member.id !== collaborationManager.memberId && (
                                <button 
                                    className={styles.kickButton}
                                    onClick={() => handleKickMember(member.id)}
                                >
                                    {props.intl.formatMessage(messages.kick)}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.roomActions}>
                <button
                    className={styles.leaveButton}
                    onClick={handleLeaveRoom}
                >
                    {props.intl.formatMessage(messages.leaveRoom)}
                </button>
            </div>
        </div>
    );

    return (
        <Modal
            className={styles.modalContent}
            onRequestClose={props.onClose}
            contentLabel={props.intl.formatMessage(messages.title)}
            id="collaborationModal"
        >
            <Box className={styles.body}>
                <h2 className={styles.title}>
                    {props.intl.formatMessage(messages.title)}
                </h2>

                {view === 'main' && renderMainView()}
                {view === 'join' && renderJoinView()}
                {view === 'room' && renderRoomView()}

                {view !== 'room' && (
                    <div className={styles.buttonRow}>
                        <button
                            className={styles.closeButton}
                            onClick={props.onClose}
                        >
                            {props.intl.formatMessage(messages.close)}
                        </button>
                    </div>
                )}
            </Box>
        </Modal>
    );
};

CollaborationModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(CollaborationModal);
