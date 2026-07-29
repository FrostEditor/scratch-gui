import {defineMessages, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import ForumAuthModal from '../menu-bar/forum-auth-modal.jsx'; // tw: 登录门槛复用论坛登录弹窗
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
    roomNotFound: {
        defaultMessage: '房间不存在或已过期',
        description: 'Message when room is not found',
        id: 'tw.collaboration.roomNotFound'
    },
    username: {
        defaultMessage: '用户名',
        description: 'Username label',
        id: 'tw.collaboration.username'
    },
    description: {
        defaultMessage: '与朋友一起实时协作编辑项目（基于 PeerJS 点对点连接）',
        description: 'Description of collaboration feature',
        id: 'tw.collaboration.description'
    },
    loginRequired: {
        defaultMessage: '请先登录后再使用多人协作',
        description: 'Message when collaboration requires login',
        id: 'tw.collaboration.loginRequired'
    },
    loginHint: {
        defaultMessage: '登录创客次元社区账号后即可创建或加入协作房间',
        description: 'Hint under login required for collaboration',
        id: 'tw.collaboration.loginHint'
    },
    loginButton: {
        defaultMessage: '登录 / 注册',
        description: 'Button to login for collaboration',
        id: 'tw.collaboration.loginButton'
    },
    chatPlaceholder: {
        defaultMessage: '输入消息...',
        description: 'Placeholder for chat input',
        id: 'tw.collaboration.chatPlaceholder'
    },
    send: {
        defaultMessage: '发送',
        description: 'Button to send chat message',
        id: 'tw.collaboration.send'
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
    const [username, setUsername] = useState('用户');
    const [isLoading, setIsLoading] = useState(false);
    const [roomNotFound, setRoomNotFound] = useState(false);
    const [chat, setChat] = useState([]);
    const [chatInput, setChatInput] = useState('');

    const isMounted = useRef(true);

    // 登录门槛：未登录论坛账号时，弹出登录 / 注册，成功后即可使用多人协作。
    const loggedIn = !!(props.forumUser && props.forumUser.user);
    const [authOpen, setAuthOpen] = useState(false);
    const [authMode, setAuthMode] = useState('login');
    const openAuth = () => {
        setAuthMode('login');
        setAuthOpen(true);
    };
    const closeAuth = () => setAuthOpen(false);
    const handleAuthSuccess = user => {
        setAuthOpen(false);
        if (user && props.onSetForumUser) props.onSetForumUser(user);
    };

    const copyRoomKey = () => {
        const text = collaborationManager.roomKey || roomKey;
        if (!text) return;
        const done = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => {
                // 降级：临时 textarea
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e) { /* ignore */ }
                document.body.removeChild(ta);
                done();
            });
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { /* ignore */ }
            document.body.removeChild(ta);
            done();
        }
    };

    const handleCreateRoom = async () => {
        if (isLoading) return;
        setIsLoading(true);
        setError('');
        try {
            const name = username.trim() || '用户';
            collaborationManager.setUsername(name);
            await collaborationManager.createRoom(null, name);
            if (!isMounted.current) return;
            setStatus('connected');
            setIsHost(true);
            setRoomKey(collaborationManager.roomKey || '');
            setMembers(collaborationManager.members || []);
            setChat(collaborationManager.chatMessages || []);
            setView('room');
        } catch (e) {
            if (!isMounted.current) return;
            setError(e.message || '创建房间失败');
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    };

    const handleJoinRoom = async () => {
        if (isLoading) return;
        const key = inputKey.trim();
        if (!key) {
            setError('请输入房间密钥');
            return;
        }
        setIsLoading(true);
        setError('');
        setRoomNotFound(false);
        try {
            const name = username.trim() || '用户';
            collaborationManager.setUsername(name);
            await collaborationManager.joinRoom(key, name);
            if (!isMounted.current) return;
            setStatus('connected');
            setIsHost(collaborationManager.isHost);
            setRoomKey(collaborationManager.roomKey || key.toUpperCase());
            setMembers(collaborationManager.members || []);
            setChat(collaborationManager.chatMessages || []);
            setView('room');
        } catch (e) {
            if (!isMounted.current) return;
            setError(e.message || '加入房间失败');
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    };

    const handleLeaveRoom = () => {
        collaborationManager.leaveRoom();
        setView('main');
        setRoomKey('');
        setMembers([]);
        setIsHost(false);
        setChat([]);
        setStatus('disconnected');
    };

    const handleKick = memberId => {
        collaborationManager.kickMember(memberId);
    };

    const handleSendChat = () => {
        const text = chatInput.trim();
        if (!text) return;
        collaborationManager.sendChatMessage(text);
        setChatInput('');
    };

    const handleChatKeyDown = e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSendChat();
        }
    };

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
            setChat([]);
        };
        const handleError = data => {
            if (!isMounted.current) return;
            setError(data.message || data.reason || '未知错误');
            setIsLoading(false);
        };
        const handleMembersUpdated = newMembers => {
            if (!isMounted.current) return;
            setMembers(newMembers || []);
            setIsHost(collaborationManager.isHost);
        };
        const handleKicked = data => {
            if (!isMounted.current) return;
            setError(data.reason || '你被移出了房间');
            setView('main');
            setRoomKey('');
            setMembers([]);
            setIsHost(false);
            setChat([]);
        };
        const handleRoomNotFound = () => {
            if (!isMounted.current) return;
            setRoomNotFound(true);
            setError(props.intl.formatMessage(messages.roomNotFound));
            setIsLoading(false);
            collaborationManager.leaveRoom();
            setView('join');
        };
        const handleChatMessage = msg => {
            if (!isMounted.current) return;
            setChat(prev => [...prev, msg]);
        };

        collaborationManager.on('connected', handleConnected);
        collaborationManager.on('disconnected', handleDisconnected);
        collaborationManager.on('error', handleError);
        collaborationManager.on('members-updated', handleMembersUpdated);
        collaborationManager.on('kicked', handleKicked);
        collaborationManager.on('room-not-found', handleRoomNotFound);
        collaborationManager.on('chat-message', handleChatMessage);

        // 检查当前状态
        if (collaborationManager.isConnected) {
            setStatus('connected');
            if (collaborationManager.roomKey) {
                setRoomKey(collaborationManager.roomKey);
                setIsHost(collaborationManager.isHost);
                setMembers(collaborationManager.members || []);
                setChat(collaborationManager.chatMessages || []);
                setView('room');
            }
        }
        // 还原用户名
        try {
            const saved = localStorage.getItem('collaborationUsername');
            if (saved) setUsername(saved);
        } catch (e) {}

        return () => {
            isMounted.current = false;
            collaborationManager.off('connected', handleConnected);
            collaborationManager.off('disconnected', handleDisconnected);
            collaborationManager.off('error', handleError);
            collaborationManager.off('members-updated', handleMembersUpdated);
            collaborationManager.off('kicked', handleKicked);
            collaborationManager.off('room-not-found', handleRoomNotFound);
            collaborationManager.off('chat-message', handleChatMessage);
        };
    }, []);

    const renderMainView = () => (
        <div className={styles.mainView}>
            <p className={styles.description}>
                {props.intl.formatMessage(messages.description)}
            </p>
            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                    {props.intl.formatMessage(messages.username)}
                </label>
                <input
                    className={styles.roomKeyInput}
                    style={{fontSize: '1rem', letterSpacing: 'normal', textTransform: 'none'}}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={props.intl.formatMessage(messages.username)}
                />
            </div>
            <div className={styles.buttonGroup}>
                <button
                    className={styles.primaryButton}
                    onClick={handleCreateRoom}
                    disabled={isLoading}
                >
                    {props.intl.formatMessage(messages.createRoom)}
                </button>
                <button
                    className={styles.secondaryButton}
                    onClick={() => setView('join')}
                    disabled={isLoading}
                >
                    {props.intl.formatMessage(messages.joinRoom)}
                </button>
            </div>
        </div>
    );

    const renderJoinView = () => (
        <div className={styles.joinView}>
            <button className={styles.backButton} onClick={() => setView('main')}>
                ← {props.intl.formatMessage(messages.back)}
            </button>
            <h3 className={styles.subtitle}>
                {props.intl.formatMessage(messages.joinRoom)}
            </h3>
            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                    {props.intl.formatMessage(messages.roomKey)}
                </label>
                <input
                    className={styles.roomKeyInput}
                    value={inputKey}
                    onChange={e => setInputKey(e.target.value)}
                    placeholder={props.intl.formatMessage(messages.enterRoomKey)}
                />
            </div>
            <div className={styles.buttonGroup}>
                <button
                    className={styles.primaryButton}
                    onClick={handleJoinRoom}
                    disabled={isLoading}
                >
                    {props.intl.formatMessage(messages.join)}
                </button>
            </div>
        </div>
    );

    const renderRoomView = () => (
        <div className={styles.roomView}>
            <div className={styles.roomHeader}>
                <div className={styles.roomKeyDisplay}>
                    <span className={styles.roomKeyLabel}>
                        {props.intl.formatMessage(messages.roomKey)}:
                    </span>
                    <span className={styles.roomKeyValue}>
                        {collaborationManager.roomKey || roomKey}
                    </span>
                    <button className={styles.copyButton} onClick={copyRoomKey}>
                        {copied
                            ? props.intl.formatMessage(messages.copied)
                            : props.intl.formatMessage(messages.copy)}
                    </button>
                </div>
                <div className={styles.syncStatus}>
                    <span className={`${styles.statusDot} ${styles[status]}`} />
                    <span className={styles.statusText}>
                        {status === 'connected'
                            ? props.intl.formatMessage(messages.connected)
                            : status === 'connecting'
                                ? props.intl.formatMessage(messages.connecting)
                                : props.intl.formatMessage(messages.disconnected)}
                    </span>
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
                                <div
                                    className={styles.memberAvatar}
                                    style={{backgroundColor: member.color || '#4ECDC4'}}
                                >
                                    {(member.username || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.memberName}>
                                    {member.username || '用户'}
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
                            <div className={styles.memberActions}>
                                {isHost && member.id !== collaborationManager.memberId && (
                                    <button
                                        className={styles.kickButton}
                                        onClick={() => handleKick(member.id)}
                                    >
                                        {props.intl.formatMessage(messages.kick)}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.chatSection}>
                <h4 className={styles.membersTitle}>
                    {props.intl.formatMessage(messages.chatPlaceholder)}
                </h4>
                <div className={styles.chatMessages}>
                    {chat.length === 0 && (
                        <div className={styles.chatEmpty}>暂无消息</div>
                    )}
                    {chat.map((m, i) => (
                        <div key={m.id || i} className={styles.chatMessage}>
                            <span
                                className={styles.chatUsername}
                                style={{color: m.color || '#4ECDC4'}}
                            >
                                {m.username || '用户'}:
                            </span>{' '}
                            <span className={styles.chatText}>{m.text}</span>
                        </div>
                    ))}
                </div>
                <div className={styles.chatInputRow}>
                    <input
                        className={styles.chatInput}
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder={props.intl.formatMessage(messages.chatPlaceholder)}
                    />
                    <button className={styles.copyButton} onClick={handleSendChat}>
                        {props.intl.formatMessage(messages.send)}
                    </button>
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

                {/* 未登录论坛账号：先要求登录，登录成功后才能使用多人协作 */}
                {!loggedIn && (
                    <div style={{textAlign: 'center', padding: '12px 0'}}>
                        <p className={styles.description}>
                            {props.intl.formatMessage(messages.loginRequired)}
                        </p>
                        <p style={{fontSize: 13, color: '#888', margin: '0 0 16px'}}>
                            {props.intl.formatMessage(messages.loginHint)}
                        </p>
                        <div className={styles.buttonGroup}>
                            <button
                                className={styles.primaryButton}
                                onClick={openAuth}
                            >
                                {props.intl.formatMessage(messages.loginButton)}
                            </button>
                        </div>
                        <div className={styles.buttonRow}>
                            <button
                                className={styles.closeButton}
                                onClick={props.onClose}
                            >
                                {props.intl.formatMessage(messages.close)}
                            </button>
                        </div>
                    </div>
                )}

                {/* 已登录：正常显示协作内容 */}
                {loggedIn && (
                    <>
                        {error && (
                            <div className={styles.errorMessage}>
                                {error}
                            </div>
                        )}
                        {isLoading && (
                            <div className={styles.syncStatus} style={{color: '#ff9800'}}>
                                <span className={`${styles.statusDot} ${styles.connecting}`} />
                                {props.intl.formatMessage(messages.connecting)}
                            </div>
                        )}
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
                    </>
                )}
            </Box>
            {authOpen && (
                <ForumAuthModal
                    open
                    mode={authMode}
                    onModeChange={setAuthMode}
                    onClose={closeAuth}
                    onSuccess={handleAuthSuccess}
                />
            )}
        </Modal>
    );
};

CollaborationModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    forumUser: PropTypes.shape({
        user: PropTypes.object,
        loggedIn: PropTypes.bool,
        status: PropTypes.string
    }),
    onSetForumUser: PropTypes.func,
    onLogoutForumUser: PropTypes.func
};

export default injectIntl(CollaborationModal);
