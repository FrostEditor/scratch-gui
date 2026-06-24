// 自定义编辑器背景工具函数

let backgroundCheckInterval = null;

// 应用背景
function applyBgInternal() {
    const backgroundImage = localStorage.getItem('customBackgroundImage');
    const blurAmount = parseInt(localStorage.getItem('customBlurAmount'), 10) || 0;
    
    // 找到工作区 SVG
    const svg = document.querySelector('.blocklySvg');
    if (!svg) return false;
    
    // 找到白色背景矩形
    const mainBackground = document.querySelector('.blocklyMainBackground');
    
    // 如果没有背景图片，恢复默认
    if (!backgroundImage) {
        svg.style.backgroundImage = '';
        svg.style.backgroundSize = '';
        svg.style.backgroundPosition = '';
        svg.style.backgroundRepeat = '';
        svg.style.filter = '';
        
        if (mainBackground) {
            mainBackground.setAttribute('fill', '');
        }
        return false;
    }
    
    // 直接给 SVG 设置背景图片
    svg.style.backgroundImage = `url(${backgroundImage})`;
    svg.style.backgroundSize = 'cover';
    svg.style.backgroundPosition = 'center center';
    svg.style.backgroundRepeat = 'no-repeat';
    
    // 模糊效果（注意：这会模糊整个 SVG 包括积木，所以先不加）
    // 如果需要模糊，应该用单独的背景层，这里先不实现模糊
    
    // 让白色背景矩形透明
    if (mainBackground) {
        mainBackground.setAttribute('fill', 'transparent');
    }
    
    return true;
}

// 对外暴露的应用背景函数
export function applyCustomBackground() {
    return applyBgInternal();
}

// 初始化背景监听器
export function initBackgroundObserver() {
    // 先尝试应用一次
    setTimeout(() => {
        applyBgInternal();
    }, 1000);
    
    // 定期检查背景是否存在，防止被 Blockly 重绘清除
    if (backgroundCheckInterval) {
        clearInterval(backgroundCheckInterval);
    }
    
    backgroundCheckInterval = setInterval(() => {
        const hasBg = localStorage.getItem('customBackgroundImage');
        if (hasBg) {
            const svg = document.querySelector('.blocklySvg');
            if (svg && !svg.style.backgroundImage) {
                applyBgInternal();
            }
        }
    }, 2000);
}
