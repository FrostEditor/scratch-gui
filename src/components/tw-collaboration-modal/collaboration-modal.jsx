import {defineMessages, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import multiCollaborationManager from '../../lib/multi-collaboration/multi-collaboration-manager.js';
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
    },
    feCollab: {
        defaultMessage: 'FE端协作',
        description: 'Button to select FE-side collaboration mode',
        id: 'tw.collaboration.feCollab'
    },
    multiCollab: {
        defaultMessage: '多端协作',
        description: 'Button to select multi-end collaboration mode',
        id: 'tw.collaboration.multiCollab'
    },
    multiDescription: {
        defaultMessage: '通过 PeerJS 连接，可与不同编辑器的用户实时协作',
        description: 'Description of multi-end collaboration',
        id: 'tw.collaboration.multiDescription'
    },
    multiTip: {
        defaultMessage: '理论上讲，多端协作可以用同一个房间号连接mw、bilup、02e、rw等支持的编辑器。',
        description: 'Tip about multi-end collaboration support',
        id: 'tw.collaboration.multiTip'
    },
    multiRoomId: {
        defaultMessage: '房间号',
        description: 'Label for multi-end room id',
        id: 'tw.collaboration.multiRoomId'
    },
    multiEnterRoomId: {
        defaultMessage: '请输入房间号',
        description: 'Placeholder for multi-end room id input',
        id: 'tw.collaboration.multiEnterRoomId'
    },
    multiCreateRoom: {
        defaultMessage: '创建房间',
        description: 'Button to create a multi-end room',
        id: 'tw.collaboration.multiCreateRoom'
    },
    multiJoinRoom: {
        defaultMessage: '加入房间',
        description: 'Button to join a multi-end room',
        id: 'tw.collaboration.multiJoinRoom'
    },
    multiCopyRoomUrl: {
        defaultMessage: '复制房间链接',
        description: 'Button to copy multi-end room URL',
        id: 'tw.collaboration.multiCopyRoomUrl'
    },
    privacyTitle: {
        defaultMessage: '房间隐私',
        description: 'Title for room privacy section',
        id: 'tw.collaboration.privacyTitle'
    },
    publicRoom: {
        defaultMessage: '公开房间',
        description: 'Public room label',
        id: 'tw.collaboration.publicRoom'
    },
    publicRoomDesc: {
        defaultMessage: '任何人都可以直接加入，无需批准',
        description: 'Description of public room',
        id: 'tw.collaboration.publicRoomDesc'
    },
    privateRoom: {
        defaultMessage: '私有房间',
        description: 'Private room label',
        id: 'tw.collaboration.privateRoom'
    },
    privateRoomDesc: {
        defaultMessage: '需要主机批准才能加入',
        description: 'Description of private room',
        id: 'tw.collaboration.privateRoomDesc'
    },
    makePublic: {
        defaultMessage: '设为公开',
        description: 'Button to set room public',
        id: 'tw.collaboration.makePublic'
    },
    makePrivate: {
        defaultMessage: '设为私有',
        description: 'Button to set room private',
        id: 'tw.collaboration.makePrivate'
    },
    pendingRequests: {
        defaultMessage: '待处理的加入请求',
        description: 'Title for pending join requests',
        id: 'tw.collaboration.pendingRequests'
    },
    approve: {
        defaultMessage: '批准',
        description: 'Approve join request',
        id: 'tw.collaboration.approve'
    },
    deny: {
        defaultMessage: '拒绝',
        description: 'Deny join request',
        id: 'tw.collaboration.deny'
    },
    waitingApproval: {
        defaultMessage: '等待主机批准...',
        description: 'Waiting for host approval',
        id: 'tw.collaboration.waitingApproval'
    },
    requestDenied: {
        defaultMessage: '您的加入请求被拒绝',
        description: 'Join request denied',
        id: 'tw.collaboration.requestDenied'
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
    const [roomNotFound, setRoomNotFound] = useState(false);

    // 协作模式：'fe' = FE端协作，'multi' = 多端协作
    const [collabMode, setCollabMode] = useState('fe');

    // 多端协作状态
    const [multiView, setMultiView] = useState('main'); // main, join, room
    const [multiRoomId, setMultiRoomId] = useState('');
    const [multiInputId, setMultiInputId] = useState('');
    const [multiMembers, setMultiMembers] = useState([]);
    const [multiIsHost, setMultiIsHost] = useState(false);
    const [multiStatus, setMultiStatus] = useState('disconnected');
    const [multiError, setMultiError] = useState('');
    const [multiIsLoading, setMultiIsLoading] = useState(false);
    const [multiCopied, setMultiCopied] = useState(false);

    // 多端协作隐私与审批状态
    const [multiPrivacy, setMultiPrivacy] = useState('public');
    const [multiPendingRequests, setMultiPendingRequests] = useState([]);
    const [multiApprovalState, setMultiApprovalState] = useState(null); // null, 'pending', 'approved', 'denied'

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
            setRoomNotFound(false);
        };

        const handleError = data => {
            if (!isMounted.current) return;
            setError(data.message || data.reason || '未知错误');
            setIsLoading(false);
        };

        const handleMembersUpdated = newMembers => {
            if (!isMounted.current) return;
            setMembers(newMembers);
        };

        const handleKicked = data => {
            if (!isMounted.current) return;
            setError(data.reason || '你被移出了房间');
            setView('main');
            setRoomKey('');
            setMembers([]);
            setIsHost(false);
        };

        const handleRoomNotFound = () => {
            if (!isMounted.current) return;
            setRoomNotFound(true);
            setError(props.intl.formatMessage(messages.roomNotFound));
            setIsLoading(false);
            // 自动离开房间
            collaborationManager.leaveRoom();
            setView('join');
        };
        
        const handleHostChanged = data => {
            if (!isMounted.current) return;
            setIsHost(collaborationManager.isHost);
        };
        
        collaborationManager.on('connected', handleConnected);
        collaborationManager.on('disconnected', handleDisconnected);
        collaborationManager.on('error', handleError);
        collaborationManager.on('members-updated', handleMembersUpdated);
        collaborationManager.on('kicked', handleKicked);
        collaborationManager.on('room-not-found', handleRoomNotFound);
        collaborationManager.on('host-changed', handleHostChanged);

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
            collaborationManager.off('room-not-found', handleRoomNotFound);
            collaborationManager.off('host-changed', handleHostChanged);
        };
    }, []);

    // 多端协作事件监听
    useEffect(() => {
        isMounted.current = true;

        const handleMultiConnected = () => {
            if (!isMounted.current) return;
            setMultiStatus('connected');
            setMultiError('');
        };

        const handleMultiDisconnected = () => {
            if (!isMounted.current) return;
            setMultiStatus('disconnected');
            setMultiView('main');
            setMultiRoomId('');
            setMultiMembers([]);
            setMultiIsHost(false);
            setMultiPrivacy('public');
            setMultiPendingRequests([]);
            setMultiApprovalState(null);
        };

        const handleMultiError = data => {
            if (!isMounted.current) return;
            setMultiError(data.message || data.reason || '未知错误');
            setMultiIsLoading(false);
        };

        const handleMultiMembersUpdated = newMembers => {
            if (!isMounted.current) return;
            setMultiMembers(newMembers);
        };

        const handleMultiKicked = data => {
            if (!isMounted.current) return;
            setMultiError(data.reason || '你被移出了房间');
            setMultiView('main');
            setMultiRoomId('');
            setMultiMembers([]);
            setMultiIsHost(false);
        };

        multiCollaborationManager.on('connected', handleMultiConnected);
        multiCollaborationManager.on('disconnected', handleMultiDisconnected);
        multiCollaborationManager.on('error', handleMultiError);
        multiCollaborationManager.on('members-updated', handleMultiMembersUpdated);
        multiCollaborationManager.on('kicked', handleMultiKicked);

        const handleMultiPrivacyChanged = privacy => {
            if (!isMounted.current) return;
            setMultiPrivacy(privacy);
        };

        const handleMultiPendingRequestsUpdated = requests => {
            if (!isMounted.current) return;
            setMultiPendingRequests(requests);
        };

        const handleMultiJoinRequestReceived = data => {
            if (!isMounted.current) return;
            setMultiApprovalState('pending');
        };

        const handleMultiApprovalResolved = data => {
            if (!isMounted.current) return;
            if (data.approved) {
                setMultiApprovalState('approved');
                setMultiView('room');
                setMultiError('');
                setMultiStatus('connected');
            } else {
                setMultiApprovalState('denied');
                setMultiError(data.reason || '您的加入请求被拒绝');
                setTimeout(() => {
                    multiCollaborationManager.disconnect();
                    setMultiView('main');
                    setMultiApprovalState(null);
                }, 2000);
            }
        };

        const handleMultiAwaitingApproval = () => {
            if (!isMounted.current) return;
            setMultiApprovalState('pending');
            setMultiView('room');
            setMultiStatus('connecting');
        };

        multiCollaborationManager.on('privacy-changed', handleMultiPrivacyChanged);
        multiCollaborationManager.on('pending-requests-updated', handleMultiPendingRequestsUpdated);
        multiCollaborationManager.on('join-request-received', handleMultiJoinRequestReceived);
        multiCollaborationManager.on('approval-resolved', handleMultiApprovalResolved);
        multiCollaborationManager.on('awaiting-approval', handleMultiAwaitingApproval);

        // 检查当前状态
        if (multiCollaborationManager.isConnected) {
            setMultiStatus('connected');
            if (multiCollaborationManager.roomId) {
                setMultiRoomId(multiCollaborationManager.roomId);
                setMultiIsHost(multiCollaborationManager.isHost);
                setMultiMembers(multiCollaborationManager.members);
                setMultiPrivacy(multiCollaborationManager.roomPrivacy);
                setMultiView('room');
            }
        }

        // 从 localStorage 读取用户名
        const savedUsername = localStorage.getItem('collaborationUsername');
        if (savedUsername) {
            multiCollaborationManager.setUsername(savedUsername);
        }

        return () => {
            isMounted.current = false;
            multiCollaborationManager.off('connected', handleMultiConnected);
            multiCollaborationManager.off('disconnected', handleMultiDisconnected);
            multiCollaborationManager.off('error', handleMultiError);
            multiCollaborationManager.off('members-updated', handleMultiMembersUpdated);
            multiCollaborationManager.off('kicked', handleMultiKicked);
            multiCollaborationManager.off('privacy-changed', handleMultiPrivacyChanged);
            multiCollaborationManager.off('pending-requests-updated', handleMultiPendingRequestsUpdated);
            multiCollaborationManager.off('join-request-received', handleMultiJoinRequestReceived);
            multiCollaborationManager.off('approval-resolved', handleMultiApprovalResolved);
            multiCollaborationManager.off('awaiting-approval', handleMultiAwaitingApproval);
        };
    }, []);

    // 保存服务器地址
    const saveServerUrl = url => {
        localStorage.setItem('collaborationServerUrl', url);
    };

    // 保存用户名
    const saveUsername = name => {
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
    const handleKickMember = memberId => {
        if (window.confirm('确定要移出这个成员吗？')) {
            collaborationManager.kickMember(memberId);
        }
    };

    // === 多端协作处理函数 ===

    // 保存用户名（多端协作共用）
    const saveMultiUsername = name => {
        localStorage.setItem('collaborationUsername', name);
        multiCollaborationManager.setUsername(name);
    };

    // 创建多端协作房间
    const handleMultiCreateRoom = async () => {
        setMultiError('');
        setMultiIsLoading(true);
        setMultiStatus('connecting');

        try {
            saveMultiUsername(username);
            const result = await multiCollaborationManager.createRoom(null, username);
            setMultiRoomId(result.roomKey);
            setMultiIsHost(result.isHost);
            setMultiMembers(result.members);
            setMultiView('room');
            setMultiStatus('connected');
        } catch (e) {
            setMultiError(e.message || '创建房间失败');
            setMultiStatus('disconnected');
        } finally {
            setMultiIsLoading(false);
        }
    };

    // 加入多端协作房间
    const handleMultiJoinRoom = async () => {
        if (!multiInputId.trim()) {
            setMultiError('请输入房间号');
            return;
        }

        setMultiError('');
        setMultiIsLoading(true);
        setMultiStatus('connecting');

        try {
            saveMultiUsername(username);
            const result = await multiCollaborationManager.joinRoom(multiInputId, username);
            setMultiRoomId(result.roomKey);
            setMultiIsHost(result.isHost);
            setMultiMembers(result.members);
            setMultiView('room');
            setMultiStatus('connected');
        } catch (e) {
            setMultiError(e.message || '加入房间失败');
            setMultiStatus('disconnected');
        } finally {
            setMultiIsLoading(false);
        }
    };

    // 复制多端协作房间链接
    const handleMultiCopyUrl = () => {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('room', multiRoomId);
        currentUrl.searchParams.delete('username');
        const roomUrl = currentUrl.toString();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(roomUrl).then(() => {
                setMultiCopied(true);
                setTimeout(() => setMultiCopied(false), 2000);
            })
                .catch(() => {
                    setMultiCopied(true);
                    setTimeout(() => setMultiCopied(false), 2000);
                });
        }
    };

    // 离开多端协作房间
    const handleMultiLeaveRoom = () => {
        multiCollaborationManager.leaveRoom();
        setMultiView('main');
        setMultiRoomId('');
        setMultiMembers([]);
        setMultiIsHost(false);
        setMultiStatus('disconnected');
        setMultiPrivacy('public');
        setMultiPendingRequests([]);
        setMultiApprovalState(null);
    };

    // 设置房间隐私
    const handleMultiSetPrivacy = privacy => {
        multiCollaborationManager.setRoomPrivacy(privacy);
        setMultiPrivacy(privacy);
    };

    // 批准加入请求
    const handleMultiApproveRequest = requestId => {
        multiCollaborationManager.approveJoinRequest(requestId);
    };

    // 拒绝加入请求
    const handleMultiDenyRequest = requestId => {
        multiCollaborationManager.denyJoinRequest(requestId);
    };

    // 踢出多端协作成员
    const handleMultiKickMember = memberId => {
        if (window.confirm('确定要移出这个成员吗？')) {
            multiCollaborationManager.kickMember(memberId);
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
                    <span className={`${styles.statusDot} ${styles[status]}`} />
                    <span className={styles.statusText}>
                        {status === 'connected' ?
                            props.intl.formatMessage(messages.connected) :
                            status === 'connecting' ?
                                props.intl.formatMessage(messages.connecting) :
                                props.intl.formatMessage(messages.disconnected)
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
                        {copied ?
                            props.intl.formatMessage(messages.copied) :
                            props.intl.formatMessage(messages.copy)
                        }
                    </button>
                </div>
                <div className={styles.syncStatus}>
                    <span className={`${styles.statusDot} ${styles.connected}`} />
                    <span className={styles.statusText}>实时同步中</span>
                </div>
            </div>

            <div className={styles.membersSection}>
                <h4 className={styles.membersTitle}>
                    {props.intl.formatMessage(messages.members)} ({members.length})
                </h4>
                <div className={styles.membersList}>
                    {members.map(member => (
                        <div
                            key={member.id}
                            className={styles.memberItem}
                        >
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
                                <div className={styles.memberActions}>
                                    <button
                                        className={styles.kickButton}
                                        onClick={() => handleKickMember(member.id)}
                                    >
                                        {props.intl.formatMessage(messages.kick)}
                                    </button>
                                </div>
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

    // === 多端协作渲染函数 ===

    // 渲染多端协作主界面
    const renderMultiMainView = () => (
        <div className={styles.mainView}>
            <p className={styles.description}>
                {props.intl.formatMessage(messages.multiDescription)}
            </p>

            {/* 用户名设置 */}
            <div className={styles.serverSettings}>
                <label className={styles.serverLabel}>
                    {props.intl.formatMessage(messages.username)}
                </label>
                <input
                    type="text"
                    className={styles.serverInput}
                    value={username}
                    onChange={e => {
                        setUsername(e.target.value);
                        saveMultiUsername(e.target.value);
                    }}
                    placeholder="输入你的用户名"
                    maxLength={20}
                />
                <div className={styles.statusIndicator}>
                    <span className={`${styles.statusDot} ${styles[multiStatus]}`} />
                    <span className={styles.statusText}>
                        {multiStatus === 'connected' ?
                            props.intl.formatMessage(messages.connected) :
                            multiStatus === 'connecting' ?
                                props.intl.formatMessage(messages.connecting) :
                                props.intl.formatMessage(messages.disconnected)
                        }
                    </span>
                </div>
            </div>

            {/* 互操作提示 */}
            <div className={styles.multiTip}>
                {props.intl.formatMessage(messages.multiTip)}
            </div>

            {multiError && (
                <div className={styles.errorMessage}>
                    {multiError}
                </div>
            )}

            <div className={styles.buttonGroup}>
                <button
                    className={styles.primaryButton}
                    onClick={handleMultiCreateRoom}
                    disabled={multiIsLoading}
                >
                    {multiIsLoading ? '创建中...' : props.intl.formatMessage(messages.multiCreateRoom)}
                </button>
                <button
                    className={styles.secondaryButton}
                    onClick={() => {
                        setMultiError('');
                        setMultiView('join');
                    }}
                    disabled={multiIsLoading}
                >
                    {props.intl.formatMessage(messages.multiJoinRoom)}
                </button>
            </div>
        </div>
    );

    // 渲染多端协作加入房间界面
    const renderMultiJoinView = () => (
        <div className={styles.joinView}>
            <button
                className={styles.backButton}
                onClick={() => {
                    setMultiError('');
                    setMultiView('main');
                }}
            >
                ← {props.intl.formatMessage(messages.back)}
            </button>
            <h3 className={styles.subtitle}>
                {props.intl.formatMessage(messages.multiJoinRoom)}
            </h3>

            {multiError && (
                <div className={styles.errorMessage}>
                    {multiError}
                </div>
            )}

            <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                    {props.intl.formatMessage(messages.multiRoomId)}
                </label>
                <input
                    type="text"
                    className={styles.roomKeyInput}
                    placeholder={props.intl.formatMessage(messages.multiEnterRoomId)}
                    value={multiInputId}
                    onChange={e => setMultiInputId(e.target.value)}
                    disabled={multiIsLoading}
                />
            </div>
            <button
                className={styles.primaryButton}
                onClick={handleMultiJoinRoom}
                disabled={!multiInputId.trim() || multiIsLoading}
            >
                {multiIsLoading ? '加入中...' : props.intl.formatMessage(messages.join)}
            </button>
        </div>
    );

    // 渲染多端协作房间界面
    const renderMultiRoomView = () => (
        <div className={styles.roomView}>
            <div className={styles.roomHeader}>
                <div className={styles.roomKeyDisplay}>
                    <span className={styles.roomKeyLabel}>
                        {props.intl.formatMessage(messages.multiRoomId)}:
                    </span>
                    <span className={styles.roomKeyValue}>{multiRoomId}</span>
                    <button
                        className={styles.copyButton}
                        onClick={handleMultiCopyUrl}
                    >
                        {multiCopied ?
                            props.intl.formatMessage(messages.copied) :
                            props.intl.formatMessage(messages.multiCopyRoomUrl)
                        }
                    </button>
                </div>
                <div className={styles.syncStatus}>
                    <span className={`${styles.statusDot} ${styles.connected}`} />
                    <span className={styles.statusText}>P2P 连接中</span>
                </div>
            </div>

            {/* 房间隐私设置（仅主机可见） */}
            {multiIsHost && (
                <div className={styles.privacySection}>
                    <h4 className={styles.privacyTitle}>
                        {props.intl.formatMessage(messages.privacyTitle)}
                    </h4>
                    <div className={styles.privacyOptions}>
                        <label className={`${styles.privacyOption} ${multiPrivacy === 'public' ? styles.privacyOptionActive : ''}`}>
                            <input
                                type="radio"
                                name="roomPrivacy"
                                value="public"
                                checked={multiPrivacy === 'public'}
                                onChange={() => handleMultiSetPrivacy('public')}
                            />
                            <div className={styles.privacyOptionContent}>
                                <span className={styles.privacyOptionTitle}>
                                    {props.intl.formatMessage(messages.publicRoom)}
                                </span>
                                <span className={styles.privacyOptionDesc}>
                                    {props.intl.formatMessage(messages.publicRoomDesc)}
                                </span>
                            </div>
                        </label>
                        <label className={`${styles.privacyOption} ${multiPrivacy === 'private' ? styles.privacyOptionActive : ''}`}>
                            <input
                                type="radio"
                                name="roomPrivacy"
                                value="private"
                                checked={multiPrivacy === 'private'}
                                onChange={() => handleMultiSetPrivacy('private')}
                            />
                            <div className={styles.privacyOptionContent}>
                                <span className={styles.privacyOptionTitle}>
                                    {props.intl.formatMessage(messages.privateRoom)}
                                </span>
                                <span className={styles.privacyOptionDesc}>
                                    {props.intl.formatMessage(messages.privateRoomDesc)}
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
            )}

            {/* 待处理的加入请求（仅主机，私有房间） */}
            {multiIsHost && multiPrivacy === 'private' && multiPendingRequests.length > 0 && (
                <div className={styles.pendingSection}>
                    <h4 className={styles.pendingTitle}>
                        {props.intl.formatMessage(messages.pendingRequests)} ({multiPendingRequests.length})
                    </h4>
                    <div className={styles.pendingList}>
                        {multiPendingRequests.map(request => (
                            <div key={request.id} className={styles.pendingItem}>
                                <div className={styles.pendingUser}>
                                    <div className={styles.memberAvatar}>
                                        {request.username.charAt(0)}
                                    </div>
                                    <span className={styles.pendingUsername}>
                                        {request.username}
                                    </span>
                                </div>
                                <div className={styles.pendingActions}>
                                    <button
                                        className={styles.approveButton}
                                        onClick={() => handleMultiApproveRequest(request.id)}
                                    >
                                        {props.intl.formatMessage(messages.approve)}
                                    </button>
                                    <button
                                        className={styles.denyButton}
                                        onClick={() => handleMultiDenyRequest(request.id)}
                                    >
                                        {props.intl.formatMessage(messages.deny)}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={styles.membersSection}>
                <h4 className={styles.membersTitle}>
                    {props.intl.formatMessage(messages.members)} ({multiMembers.length})
                </h4>
                <div className={styles.membersList}>
                    {multiMembers.map(member => (
                        <div
                            key={member.id}
                            className={styles.memberItem}
                        >
                            <div className={styles.memberInfo}>
                                <div className={styles.memberAvatar}>
                                    {member.username.charAt(0)}
                                </div>
                                <div className={styles.memberName}>
                                    {member.username}
                                    {member.id === multiCollaborationManager.memberId && (
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
                            {multiIsHost && member.id !== multiCollaborationManager.memberId && (
                                <div className={styles.memberActions}>
                                    <button
                                        className={styles.kickButton}
                                        onClick={() => handleMultiKickMember(member.id)}
                                    >
                                        {props.intl.formatMessage(messages.kick)}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.roomActions}>
                <button
                    className={styles.leaveButton}
                    onClick={handleMultiLeaveRoom}
                >
                    {props.intl.formatMessage(messages.leaveRoom)}
                </button>
            </div>
        </div>
    );

    // 渲染等待批准界面（客户端在私有房间中等待批准）
    const renderMultiApprovalView = () => (
        <div className={styles.approvalView}>
            <div className={styles.approvalSpinner}>
                <div className={styles.spinner} />
            </div>
            <h3 className={styles.approvalTitle}>
                {props.intl.formatMessage(messages.waitingApproval)}
            </h3>
            <p className={styles.approvalDesc}>
                {props.intl.formatMessage(messages.privateRoomDesc)}
            </p>
            {multiError && (
                <div className={styles.errorMessage}>
                    {multiError}
                </div>
            )}
            <div className={styles.roomActions}>
                <button
                    className={styles.leaveButton}
                    onClick={handleMultiLeaveRoom}
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
                        {/* 协作模式选择按钮 */}
                <div className={styles.modeSelector}>
                    <button
                        className={`${styles.modeButton} ${collabMode === 'fe' ? styles.modeButtonActive : ''}`}
                        onClick={() => setCollabMode('fe')}
                    >
                        {props.intl.formatMessage(messages.feCollab)}
                    </button>
                    <button
                        className={`${styles.modeButton} ${collabMode === 'multi' ? styles.modeButtonActive : ''}`}
                        onClick={() => setCollabMode('multi')}
                    >
                        {props.intl.formatMessage(messages.multiCollab)}
                    </button>
                </div>

                {/* FE端协作（当前界面） */}
                {collabMode === 'fe' && (
                    <>
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

                {/* 多端协作 */}
                {collabMode === 'multi' && (
                    <>
                        {multiView === 'main' && renderMultiMainView()}
                        {multiView === 'join' && renderMultiJoinView()}
                        {multiView === 'room' && multiApprovalState === 'pending' && renderMultiApprovalView()}
                        {multiView === 'room' && multiApprovalState !== 'pending' && renderMultiRoomView()}

                        {multiView !== 'room' && (
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
