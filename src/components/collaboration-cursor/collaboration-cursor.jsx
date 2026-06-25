import React, { useEffect, useRef, useState, useCallback } from 'react';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import styles from './collaboration-cursor.css';

/**
 * 协作光标组件
 * 显示其他用户的鼠标位置，发送本地鼠标位置
 */
const CollaborationCursor = () => {
    const [cursors, setCursors] = useState({}); // memberId -> { x, y, color, name }
    const [isActive, setIsActive] = useState(false);
    const [isCodeTabVisible, setIsCodeTabVisible] = useState(true); // 是否在代码标签页

    // 获取成员名称
    const getMemberName = useCallback((memberId) => {
        const member = collaborationManager.members.find(m => m.id === memberId);
        return member ? member.username : '未知用户';
    }, []);

    // 检查是否在代码标签页（积木工作区是否可见）
    const checkCodeTabVisible = useCallback(() => {
        const blocklySvg = document.querySelector('.blocklySvg');
        if (blocklySvg) {
            const style = window.getComputedStyle(blocklySvg);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
            setIsCodeTabVisible(isVisible);
        } else {
            // 找不到元素时默认显示
            setIsCodeTabVisible(true);
        }
    }, []);

    useEffect(() => {
        // 定期检查代码标签页是否可见
        checkCodeTabVisible();
        const checkInterval = setInterval(checkCodeTabVisible, 500);
        
        // 监听窗口大小变化
        window.addEventListener('resize', checkCodeTabVisible);
        
        return () => {
            clearInterval(checkInterval);
            window.removeEventListener('resize', checkCodeTabVisible);
        };
    }, [checkCodeTabVisible]);

    useEffect(() => {
        // 监听鼠标移动事件
        const handleMouseMove = (e) => {
            if (!collaborationManager.isConnected || !collaborationManager.roomKey) return;
            
            // 发送鼠标位置（相对于视口的百分比，适配不同分辨率）
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            
            collaborationManager.sendMousePosition(x, y);
        };

        // 监听协作管理器的鼠标移动事件
        const handleCollaborationMouseMove = (data) => {
            // 过滤掉自己的光标，不显示自己的远程光标
            if (data.memberId === collaborationManager.memberId) return;
            
            setCursors(prev => ({
                ...prev,
                [data.memberId]: {
                    x: data.x,
                    y: data.y,
                    color: data.color,
                    name: getMemberName(data.memberId)
                }
            }));
        };

        // 监听成员更新
        const handleMembersUpdated = (members) => {
            // 清理不在房间内的光标
            setCursors(prev => {
                const newCursors = {};
                members.forEach(member => {
                    if (prev[member.id]) {
                        newCursors[member.id] = prev[member.id];
                    }
                });
                return newCursors;
            });
        };

        // 监听连接状态
        const handleConnected = () => {
            setIsActive(true);
        };

        const handleDisconnected = () => {
            setIsActive(false);
            setCursors({});
        };

        // 监听房间加入/创建
        const handleRoomJoined = () => {
            setIsActive(true);
        };

        const handleRoomCreated = () => {
            setIsActive(true);
        };

        // 添加事件监听
        window.addEventListener('mousemove', handleMouseMove);
        collaborationManager.on('mouse-move', handleCollaborationMouseMove);
        collaborationManager.on('members-updated', handleMembersUpdated);
        collaborationManager.on('connected', handleConnected);
        collaborationManager.on('disconnected', handleDisconnected);
        collaborationManager.on('room-joined', handleRoomJoined);
        collaborationManager.on('room-created', handleRoomCreated);

        // 检查初始状态
        if (collaborationManager.isConnected && collaborationManager.roomKey) {
            setIsActive(true);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            collaborationManager.off('mouse-move', handleCollaborationMouseMove);
            collaborationManager.off('members-updated', handleMembersUpdated);
            collaborationManager.off('connected', handleConnected);
            collaborationManager.off('disconnected', handleDisconnected);
            collaborationManager.off('room-joined', handleRoomJoined);
            collaborationManager.off('room-created', handleRoomCreated);
        };
    }, [getMemberName]);

    if (!isActive || !isCodeTabVisible) return null;

    return (
        <div className={styles.cursorContainer}>
            {Object.entries(cursors).map(([memberId, cursor]) => (
                <div
                    key={memberId}
                    className={styles.remoteCursor}
                    style={{
                        left: `${cursor.x}%`,
                        top: `${cursor.y}%`,
                        '--cursor-color': cursor.color
                    }}
                >
                    <svg 
                        className={styles.cursorPointer}
                        width="20" 
                        height="20" 
                        viewBox="0 0 24 24" 
                        fill="none"
                    >
                        <path 
                            d="M5 3L19 12L12 13L9 20L5 3Z" 
                            fill="var(--cursor-color)"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div className={styles.cursorLabel}>
                        {cursor.name}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default CollaborationCursor;
