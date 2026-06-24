import PropTypes from 'prop-types';
import React, {useState, useEffect, useRef} from 'react';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import collaborationManager from '../../lib/collaboration/collaboration-manager.js';
import styles from './chat-modal.css';

const ChatModal = ({onClose}) => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    };

    useEffect(() => {
        const handleChatMessage = (message) => {
            setMessages(prev => [...prev, message]);
        };

        collaborationManager.on('chat-message', handleChatMessage);

        return () => {
            collaborationManager.off('chat-message', handleChatMessage);
        };
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!inputText.trim()) return;
        collaborationManager.sendChatMessage(inputText);
        setInputText('');
        inputRef.current?.focus();
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    };

    return (
        <Modal
            className={styles.modal}
            contentLabel="聊天"
            onRequestClose={onClose}
        >
            <Box className={styles.container}>
                <div className={styles.header}>
                    <span className={styles.title}>协作聊天</span>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                
                <div className={styles.messagesContainer}>
                    {messages.length === 0 ? (
                        <div className={styles.emptyState}>
                            暂无消息，开始聊天吧
                        </div>
                    ) : (
                        messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`${styles.message} ${msg.isSelf ? styles.selfMessage : styles.otherMessage}`}
                            >
                                {!msg.isSelf && (
                                    <div className={styles.senderName}>{msg.username}</div>
                                )}
                                <div className={styles.messageBubble}>
                                    {msg.text}
                                </div>
                                <div className={styles.messageTime}>
                                    {formatTime(msg.timestamp)}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
                
                <div className={styles.inputContainer}>
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.input}
                        placeholder="输入消息..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                    />
                    <button className={styles.sendButton} onClick={handleSend}>
                        发送
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

ChatModal.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default ChatModal;
