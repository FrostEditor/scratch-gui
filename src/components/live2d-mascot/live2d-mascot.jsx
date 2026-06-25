import React from 'react';
import './live2d-mascot.css';

class Live2dMascot extends React.Component {
    constructor(props) {
        super(props);
        
        // 从 localStorage 读取保存的位置
        const savedPosition = localStorage.getItem('mascotPosition');
        let x, y;
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                x = pos.x;
                y = pos.y;
            } catch (e) {
                x = window.innerWidth - 180;
                y = window.innerHeight - 220;
            }
        } else {
            // 默认位置：右下角
            x = window.innerWidth - 180;
            y = window.innerHeight - 220;
        }
        
        this.state = {
            x: x,
            y: y,
            isDragging: false,
            isMinimized: false,
            rotationX: 0,
            rotationY: 0,
            scale: 1,
            message: '',
            messages: [
                '你好呀~',
                '今天也要加油哦！',
                '有什么我可以帮你的吗？',
                '记得保存作品哦~',
                '创作愉快！',
                '累了就休息一下吧~',
                '你真棒！',
                '一起加油吧！'
            ]
        };
        
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.elementRef = React.createRef();
        this.messageTimeout = null;
    }
    
    componentDidMount() {
        // 随机显示一条消息
        this.showRandomMessage();
        
        // 每隔一段时间随机显示消息
        this.messageInterval = setInterval(() => {
            if (Math.random() > 0.7) {
                this.showRandomMessage();
            }
        }, 10000);
        
        // 监听窗口大小变化
        window.addEventListener('resize', this.handleWindowResize);
    }
    
    componentWillUnmount() {
        if (this.messageInterval) {
            clearInterval(this.messageInterval);
        }
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        window.removeEventListener('resize', this.handleWindowResize);
    }
    
    handleWindowResize = () => {
        // 确保看板娘不会超出屏幕
        this.setState(prev => ({
            x: Math.min(prev.x, window.innerWidth - 100),
            y: Math.min(prev.y, window.innerHeight - 100)
        }));
    }
    
    // 显示随机消息
    showRandomMessage = () => {
        const messages = this.state.messages;
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        this.setState({ message: randomMessage });
        
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        this.messageTimeout = setTimeout(() => {
            this.setState({ message: '' });
        }, 4000);
    }
    
    // 开始拖拽
    handleMouseDown = (e) => {
        if (e.button !== 0) return; // 只响应左键
        
        e.preventDefault();
        e.stopPropagation();
        
        this.setState({ isDragging: true });
        this.dragStartX = e.clientX - this.state.x;
        this.dragStartY = e.clientY - this.state.y;
        
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }
    
    // 拖拽中
    handleMouseMove = (e) => {
        if (!this.state.isDragging) return;
        
        let newX = e.clientX - this.dragStartX;
        let newY = e.clientY - this.dragStartY;
        
        // 限制在屏幕范围内
        newX = Math.max(0, Math.min(newX, window.innerWidth - 160));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 200));
        
        // 计算 3D 倾斜效果
        const rect = this.elementRef.current?.getBoundingClientRect();
        if (rect) {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deltaX = (e.clientX - centerX) / rect.width;
            const deltaY = (e.clientY - centerY) / rect.height;
            
            this.setState({
                x: newX,
                y: newY,
                rotationY: deltaX * 20, // 左右倾斜
                rotationX: -deltaY * 20 // 上下倾斜
            });
        } else {
            this.setState({
                x: newX,
                y: newY
            });
        }
    }
    
    // 结束拖拽
    handleMouseUp = () => {
        this.setState({ isDragging: false, rotationX: 0, rotationY: 0 });
        
        // 保存位置到 localStorage
        localStorage.setItem('mascotPosition', JSON.stringify({
            x: this.state.x,
            y: this.state.y
        }));
        
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
    
    // 点击看板娘
    handleClick = (e) => {
        // 如果是拖拽，不触发点击
        if (this.state.isDragging) return;
        
        e.stopPropagation();
        this.showRandomMessage();
    }
    
    // 双击最小化/还原
    handleDoubleClick = (e) => {
        e.stopPropagation();
        this.setState(prev => ({ isMinimized: !prev.isMinimized }));
    }
    
    // 鼠标进入
    handleMouseEnter = () => {
        if (!this.state.isDragging) {
            this.setState({ scale: 1.05 });
        }
    }
    
    // 鼠标离开
    handleMouseLeave = () => {
        if (!this.state.isDragging) {
            this.setState({ scale: 1, rotationX: 0, rotationY: 0 });
        }
    }
    
    render() {
        const { x, y, isMinimized, rotationX, rotationY, scale, message } = this.state;
        
        if (isMinimized) {
            return (
                <div
                    className="mascot-minimized"
                    style={{ left: x, top: y }}
                    onClick={this.handleDoubleClick}
                    title="双击展开"
                >
                    <span className="mascot-min-icon">🌸</span>
                </div>
            );
        }
        
        return (
            <div
                ref={this.elementRef}
                className="live2d-mascot"
                style={{
                    left: x,
                    top: y,
                    transform: `perspective(1000px) rotateX(${rotationX}deg) rotateY(${rotationY}deg) scale(${scale})`,
                    transition: this.state.isDragging ? 'none' : 'transform 0.3s ease-out'
                }}
                onMouseDown={this.handleMouseDown}
                onClick={this.handleClick}
                onDoubleClick={this.handleDoubleClick}
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
            >
                {/* 消息气泡 */}
                {message && (
                    <div className="mascot-message">
                        {message}
                    </div>
                )}
                
                {/* 看板娘角色 */}
                <div className="mascot-character">
                    {/* 可爱的二次元风格角色 SVG */}
                    <svg viewBox="0 0 200 250" className="mascot-svg">
                        {/* 身体 */}
                        <ellipse cx="100" cy="200" rx="50" ry="40" fill="#FFB6C1" opacity="0.8"/>
                        
                        {/* 头 */}
                        <circle cx="100" cy="100" r="60" fill="#FFE4E1"/>
                        
                        {/* 头发 */}
                        <ellipse cx="100" cy="70" rx="65" ry="45" fill="#FFB6C1"/>
                        <ellipse cx="60" cy="90" rx="20" ry="50" fill="#FFB6C1"/>
                        <ellipse cx="140" cy="90" rx="20" ry="50" fill="#FFB6C1"/>
                        
                        {/* 刘海 */}
                        <path d="M 55 60 Q 70 80 85 65 Q 100 80 115 65 Q 130 80 145 60 L 145 75 Q 130 90 100 85 Q 70 90 55 75 Z" fill="#FF9CAD"/>
                        
                        {/* 眼睛 */}
                        <ellipse cx="75" cy="100" rx="12" ry="15" fill="white"/>
                        <ellipse cx="125" cy="100" rx="12" ry="15" fill="white"/>
                        <circle cx="77" cy="102" r="7" fill="#87CEEB"/>
                        <circle cx="127" cy="102" r="7" fill="#87CEEB"/>
                        <circle cx="79" cy="99" r="3" fill="white"/>
                        <circle cx="129" cy="99" r="3" fill="white"/>
                        
                        {/* 腮红 */}
                        <ellipse cx="55" cy="115" rx="10" ry="6" fill="#FFB6C1" opacity="0.6"/>
                        <ellipse cx="145" cy="115" rx="10" ry="6" fill="#FFB6C1" opacity="0.6"/>
                        
                        {/* 嘴巴 */}
                        <path d="M 90 125 Q 100 135 110 125" stroke="#FF69B4" strokeWidth="2" fill="none" strokeLinecap="round"/>
                        
                        {/* 蝴蝶结 */}
                        <path d="M 70 45 L 55 35 L 55 55 Z" fill="#FF69B4"/>
                        <path d="M 70 45 L 85 35 L 85 55 Z" fill="#FF69B4"/>
                        <circle cx="70" cy="45" r="5" fill="#FF1493"/>
                        
                        {/* 手 */}
                        <ellipse cx="45" cy="180" rx="12" ry="15" fill="#FFE4E1"/>
                        <ellipse cx="155" cy="180" rx="12" ry="15" fill="#FFE4E1"/>
                    </svg>
                </div>
                
                {/* 提示文字 */}
                <div className="mascot-hint">
                    拖动移动 · 双击最小化
                </div>
            </div>
        );
    }
}

export default Live2dMascot;
