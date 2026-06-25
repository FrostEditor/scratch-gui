import React from 'react';
import './live2d-mascot.css';

const LIVE2D_API_BASE = 'https://bd.qaiu.cn/l2d';

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
                // 默认位置：左下角
                x = 10;
                y = window.innerHeight - 280;
            }
        } else {
            // 默认位置：左下角
            x = 10;
            y = window.innerHeight - 280;
        }
        
        this.state = {
            x: x,
            y: y,
            isDragging: false,
            isMinimized: false,
            isLoading: true,
            loadError: false,
            modelImage: '',
            message: '',
            currentGroup: 1,
            currentSkin: 1
        };
        
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.containerRef = React.createRef();
        this.messageTimeout = null;
    }
    
    componentDidMount() {
        this.loadModel();
        window.addEventListener('resize', this.handleWindowResize);
    }
    
    componentWillUnmount() {
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        window.removeEventListener('resize', this.handleWindowResize);
    }
    
    handleWindowResize = () => {
        this.setState(prev => ({
            x: Math.max(0, Math.min(prev.x, window.innerWidth - 180)),
            y: Math.max(0, Math.min(prev.y, window.innerHeight - 80))
        }));
    }
    
    // 加载模型
    loadModel = async () => {
        try {
            this.setState({ isLoading: true, loadError: false });
            
            // 从 API 获取模型配置
            const modelId = `${this.state.currentGroup}-${this.state.currentSkin}`;
            const response = await fetch(`${LIVE2D_API_BASE}/get/?id=${modelId}`);
            if (!response.ok) {
                throw new Error('API 请求失败');
            }
            
            const modelConfig = await response.json();
            console.log('[看板娘] 模型配置:', modelConfig);
            
            // 获取纹理图片 URL
            if (modelConfig.textures && modelConfig.textures.length > 0) {
                const texturePath = modelConfig.textures[0];
                const imageUrl = this.convertPathToAbsolute(texturePath);
                console.log('[看板娘] 图片 URL:', imageUrl);
                
                // 预加载图片
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    this.setState({ modelImage: imageUrl, isLoading: false });
                };
                img.onerror = () => {
                    console.warn('[看板娘] 图片加载失败');
                    this.setState({ loadError: true, isLoading: false });
                };
                img.src = imageUrl;
            } else {
                throw new Error('没有纹理图片');
            }
            
        } catch (err) {
            console.warn('[看板娘] 模型加载失败:', err);
            this.setState({ loadError: true, isLoading: false });
        }
    }
    
    // 转换相对路径为绝对路径
    convertPathToAbsolute = (path) => {
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        // 处理 ../ 相对路径
        let absolutePath = LIVE2D_API_BASE + '/' + path;
        // 规范化路径
        const parts = absolutePath.split('/');
        const result = [];
        for (const part of parts) {
            if (part === '..') {
                result.pop();
            } else if (part !== '.') {
                result.push(part);
            }
        }
        return result.join('/');
    }
    
    // 开始拖拽
    handleMouseDown = (e) => {
        if (e.button !== 0) return;
        
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
        newX = Math.max(0, Math.min(newX, window.innerWidth - 180));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 80));
        
        this.setState({ x: newX, y: newY });
    }
    
    // 结束拖拽
    handleMouseUp = () => {
        this.setState({ isDragging: false });
        
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
        if (this.state.isDragging) return;
        e.stopPropagation();
        
        // 显示随机消息
        const messages = [
            '你好呀~',
            '嘿嘿~',
            '有什么事吗？',
            '不要戳人家啦~',
            '好痒啊~',
            '再戳我就生气了哦！',
            '今天也要加油哦！',
            '创作愉快~'
        ];
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        this.showMessage(randomMessage);
    }
    
    // 右键切换皮肤
    handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.switchSkin();
    }
    
    // 显示消息
    showMessage = (msg) => {
        this.setState({ message: msg });
        
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        this.messageTimeout = setTimeout(() => {
            this.setState({ message: '' });
        }, 3000);
    }
    
    // 双击最小化/还原
    handleDoubleClick = (e) => {
        e.stopPropagation();
        this.setState(prev => ({ isMinimized: !prev.isMinimized }));
    }
    
    // 切换皮肤
    switchSkin = async () => {
        try {
            const response = await fetch(`${LIVE2D_API_BASE}/switch/?id=${this.state.currentGroup}`);
            if (response.ok) {
                // 皮肤序号 +1
                this.setState(prev => {
                    const newSkin = prev.currentSkin + 1;
                    return { currentSkin: newSkin };
                }, () => {
                    this.loadModel();
                });
                this.showMessage('换了件衣服~');
            }
        } catch (err) {
            console.warn('[看板娘] 切换皮肤失败:', err);
            // 失败了就重置为 1
            this.setState({ currentSkin: 1 }, () => {
                this.loadModel();
            });
        }
    }
    
    render() {
        const { x, y, isMinimized, isLoading, loadError, modelImage, message } = this.state;
        
        if (isMinimized) {
            return (
                <div
                    className="mascot-minimized"
                    style={{ left: x, top: y }}
                    onClick={this.handleDoubleClick}
                    title="双击展开"
                >
                    <span className="mascot-min-icon">🎀</span>
                </div>
            );
        }
        
        return (
            <div
                ref={this.containerRef}
                className="live2d-mascot"
                style={{ left: x, top: y }}
                onMouseDown={this.handleMouseDown}
                onClick={this.handleClick}
                onDoubleClick={this.handleDoubleClick}
                onContextMenu={this.handleContextMenu}
            >
                {/* 消息气泡 */}
                {message && (
                    <div className="mascot-message">
                        {message}
                    </div>
                )}
                
                {/* 加载中 */}
                {isLoading && (
                    <div className="mascot-loading">
                        <div className="mascot-loading-spinner"></div>
                        <span>加载中...</span>
                    </div>
                )}
                
                {/* 加载失败 */}
                {loadError && (
                    <div className="mascot-error">
                        <div className="mascot-error-icon">😢</div>
                        <span>加载失败</span>
                        <button className="mascot-retry-btn" onClick={this.loadModel}>
                            重试
                        </button>
                    </div>
                )}
                
                {/* 看板娘图片 */}
                {modelImage && !isLoading && !loadError && (
                    <div className="mascot-image-container">
                        <img
                            src={modelImage}
                            alt="看板娘"
                            className="mascot-image"
                            draggable={false}
                        />
                    </div>
                )}
                
                {/* 提示文字 */}
                <div className="mascot-hint">
                    拖动移动 · 双击最小化 · 右键换肤
                </div>
            </div>
        );
    }
}

export default Live2dMascot;
