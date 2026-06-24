// 自定义编辑器背景工具函数

let backgroundCheckInterval = null;

// 图片压缩函数
export function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                
                // 计算缩放比例
                let scale = 1;
                if (width > maxWidth) {
                    scale = maxWidth / width;
                }
                if (height * scale > maxHeight) {
                    scale = maxHeight / height;
                }
                
                // 如果图片小于最大尺寸，不压缩
                if (scale >= 1) {
                    resolve(e.target.result);
                    return;
                }
                
                const newWidth = Math.round(width * scale);
                const newHeight = Math.round(height * scale);
                
                // 用 canvas 压缩
                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                
                // 转成 base64
                const compressed = canvas.toDataURL('image/jpeg', quality);
                resolve(compressed);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 确保 SVG 中有 defs 和模糊滤镜
function ensureBlurFilter(svg, blurAmount) {
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    
    let filter = svg.querySelector('#customBgBlur');
    if (!filter) {
        filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'customBgBlur');
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', '100%');
        filter.setAttribute('height', '100%');
        
        const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        feGaussianBlur.setAttribute('in', 'SourceGraphic');
        filter.appendChild(feGaussianBlur);
        
        defs.appendChild(filter);
    }
    
    const feGaussianBlur = filter.querySelector('feGaussianBlur');
    if (feGaussianBlur) {
        feGaussianBlur.setAttribute('stdDeviation', blurAmount);
    }
    
    return filter;
}

// 确保背景 image 元素存在
function ensureBackgroundImage(svg) {
    let bgImage = svg.querySelector('.customBackgroundImage');
    if (!bgImage) {
        bgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        bgImage.setAttribute('class', 'customBackgroundImage');
        bgImage.setAttribute('x', '0');
        bgImage.setAttribute('y', '0');
        bgImage.setAttribute('width', '100%');
        bgImage.setAttribute('height', '100%');
        bgImage.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // 类似 background-size: cover
        
        // 插入到最底层（在所有其他元素前面）
        if (svg.firstChild) {
            svg.insertBefore(bgImage, svg.firstChild);
        } else {
            svg.appendChild(bgImage);
        }
    }
    return bgImage;
}

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
        // 移除自定义背景 image
        const bgImage = svg.querySelector('.customBackgroundImage');
        if (bgImage) {
            bgImage.remove();
        }
        
        // 移除模糊滤镜
        const filter = svg.querySelector('#customBgBlur');
        if (filter) {
            filter.remove();
        }
        
        // 恢复 SVG 背景样式（清空）
        svg.style.backgroundImage = '';
        svg.style.backgroundSize = '';
        svg.style.backgroundPosition = '';
        svg.style.backgroundRepeat = '';
        svg.style.filter = '';
        
        // 恢复白色背景
        if (mainBackground) {
            mainBackground.setAttribute('fill', '');
        }
        return false;
    }
    
    // 确保白色背景矩形透明
    if (mainBackground) {
        mainBackground.setAttribute('fill', 'transparent');
    }
    
    // 清除 SVG 本身的背景（我们用 SVG 内部的 image 元素）
    svg.style.backgroundImage = '';
    svg.style.backgroundSize = '';
    svg.style.backgroundPosition = '';
    svg.style.backgroundRepeat = '';
    
    // 创建或获取背景 image 元素
    const bgImage = ensureBackgroundImage(svg);
    // 同时设置 href 和 xlink:href，确保兼容性
    bgImage.setAttribute('href', backgroundImage);
    bgImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', backgroundImage);
    
    // 处理模糊
    if (blurAmount > 0) {
        ensureBlurFilter(svg, blurAmount);
        bgImage.setAttribute('filter', 'url(#customBgBlur)');
    } else {
        bgImage.removeAttribute('filter');
        // 移除滤镜（可选，留着也没关系）
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
            if (svg) {
                const bgImage = svg.querySelector('.customBackgroundImage');
                if (!bgImage) {
                    applyBgInternal();
                }
            }
        }
    }, 2000);
}
