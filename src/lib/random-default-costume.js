/**
 * 随机默认造型加载器
 * 从本地图片中随机选择一张，替换默认角色的造型
 */

// 加载所有本地默认造型图片
const context = require.context('../assets/default-costumes/', false, /\.(jpg|jpeg|png|webp)$/);
const costumeImages = context.keys().map(key => context(key));

// 带超时的图片加载
const loadImageWithTimeout = (url, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        const timeoutId = setTimeout(() => {
            reject(new Error('图片加载超时'));
        }, timeout);
        
        img.onload = () => {
            clearTimeout(timeoutId);
            resolve(img);
        };
        
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('图片加载失败'));
        };
        
        img.src = url;
    });
};

// 等待默认角色出现（找第一个非舞台角色，不依赖名字，更可靠）
const waitForLogoTarget = async (vm, maxWait = 3000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        const targets = vm.runtime.targets;
        // 找第一个非舞台角色（不依赖名字，避免名字变化导致匹配失败）
        const logoTarget = targets.find(t => !t.isStage && t.sprite);
        if (logoTarget && logoTarget.drawableID) {
            return logoTarget;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    // 最后再试一次，即使没有 drawableID 也返回
    const targets = vm.runtime.targets;
    const logoTarget = targets.find(t => !t.isStage && t.sprite);
    return logoTarget || null;
};

const loadRandomDefaultCostume = async function (vm) {
    try {
        if (!vm || !vm.runtime || !vm.runtime.storage) {
            console.warn('[随机默认造型] VM 或 storage 不可用');
            return;
        }
        
        const storage = vm.runtime.storage;
        
        // 等待 LOGO 角色就绪
        const logoTarget = await waitForLogoTarget(vm);
        if (!logoTarget) {
            console.warn('[随机默认造型] 等待超时，找不到 LOGO 角色');
            return;
        }
        
        console.log('[随机默认造型] LOGO 角色已就绪，角色名:', logoTarget.sprite?.name);
        
        // 检查项目是否有积木块——有积木块说明不是空项目，不替换默认造型
        // 先假设没有积木块，尽量保证图片能显示
        let hasAnyBlocks = false;
        try {
            // 只检查非舞台角色的积木（舞台的积木通常不影响默认造型）
            const spriteTargets = vm.runtime.targets.filter(t => !t.isStage && t.sprite);
            console.log('[随机默认造型] 非舞台角色数量:', spriteTargets.length);
            
            for (const target of spriteTargets) {
                const blocks = target.sprite.blocks;
                if (!blocks) continue;
                
                // 尝试多种方式获取积木数量
                let blockCount = 0;
                if (blocks._blocks && typeof blocks._blocks === 'object') {
                    blockCount = Object.keys(blocks._blocks).length;
                }
                
                console.log(`[随机默认造型] 角色 ${target.sprite.name} 积木数量:`, blockCount);
                
                if (blockCount > 0) {
                    hasAnyBlocks = true;
                    break;
                }
            }
        } catch (e) {
            console.warn('[随机默认造型] 检测积木块失败，默认继续加载:', e.message);
            hasAnyBlocks = false; // 检测失败时默认继续加载
        }
        
        if (hasAnyBlocks) {
            console.log('[随机默认造型] 项目已有积木块，跳过替换');
            return;
        }
        
        console.log('[随机默认造型] 项目为空，开始加载随机图片...');
        
        // 从本地图片中随机选择一张
        if (costumeImages.length === 0) {
            console.warn('[随机默认造型] 没有找到本地默认造型图片');
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * costumeImages.length);
        const imageUrl = costumeImages[randomIndex];
        console.log('[随机默认造型] 随机选择图片:', imageUrl, `(${randomIndex + 1}/${costumeImages.length})`);
        
        // 加载图片
        const img = await loadImageWithTimeout(imageUrl, 10000);
        
        console.log('[随机默认造型] 图片加载完成，尺寸:', img.width, 'x', img.height);
        
        // 目标尺寸（2x 高清，4:3 比例）
        const targetWidth = 960;
        const targetHeight = 720;
        const targetRatio = targetWidth / targetHeight;
        const imgRatio = img.width / img.height;
        
        // 创建 canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        // 居中裁剪（垂直方向稍微偏上一点，二次元人物通常在中上部）
        let sx, sy, sw, sh;
        if (imgRatio > targetRatio) {
            // 图片更宽，裁剪左右（水平居中）
            sh = img.height;
            sw = img.height * targetRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
        } else {
            // 图片更高，裁剪上下（垂直方向偏上 10%，让人物主体更居中）
            sw = img.width;
            sh = img.width / targetRatio;
            sx = 0;
            // 偏上 10%，而不是完全居中
            const offset = (img.height - sh) * 0.4; // 0.4 = 稍微偏上（0.5 是完全居中）
            sy = Math.max(0, offset);
        }
        
        ctx.drawImage(
            img,
            sx, sy, sw, sh,
            0, 0, canvas.width, canvas.height
        );
        
        console.log('[随机默认造型] 图片绘制完成');
        
        // 获取渲染器
        const renderer = vm.runtime.renderer;
        if (!renderer) {
            console.warn('[随机默认造型] 没有渲染器，无法创建皮肤');
            return;
        }
        
        // 计算旋转中心（图片中心）
        const rotationCenter = [targetWidth / 2, targetHeight / 2];
        
        // 直接用 canvas 创建位图皮肤（这是正确的方法！）
        const skinId = renderer.createBitmapSkin(canvas, 2, rotationCenter);
        const skinSize = renderer.getSkinSize(skinId);
        
        console.log('[随机默认造型] 皮肤创建成功，skinId:', skinId, 'size:', skinSize);
        
        // 替换第一个造型
        const costume = logoTarget.sprite.costumes[0];
        const oldSkinId = costume.skinId;
        
        console.log('[随机默认造型] 旧皮肤:', oldSkinId, '新皮肤:', skinId);
        
        // 更新造型属性 - 核心：设置 skinId
        costume.skinId = skinId;
        costume.size = [skinSize[0], skinSize[1]]; // 逻辑尺寸
        costume.bitmapResolution = 2;
        costume.rotationCenterX = rotationCenter[0] / 2; // 像素坐标转逻辑坐标
        costume.rotationCenterY = rotationCenter[1] / 2;
        costume.dataFormat = 'png';
        
        // 关键：更新 drawable 的皮肤！
        if (logoTarget.drawableID) {
            renderer.updateDrawableSkinId(logoTarget.drawableID, skinId);
            console.log('[随机默认造型] 已更新 drawable 皮肤');
        } else {
            console.warn('[随机默认造型] 没有 drawableID，无法更新皮肤');
        }
        
        // 不管可见不可见，都触发重绘
        if (typeof logoTarget.emitVisualChange === 'function') {
            logoTarget.emitVisualChange();
        }
        if (typeof vm.runtime.requestRedraw === 'function') {
            vm.runtime.requestRedraw();
        }
        console.log('[随机默认造型] 已请求重绘');
        
        // 同时创建 asset（用于保存项目）
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const arrayBuffer = await blob.arrayBuffer();
        const asset = storage.createAsset(
            storage.AssetType.ImageBitmap,
            storage.DataFormat.PNG,
            new Uint8Array(arrayBuffer),
            null,
            true
        );
        costume.asset = asset;
        costume.assetId = asset.assetId;
        costume.md5ext = `${asset.assetId}.png`;
        
        console.log('[随机默认造型] Asset 创建成功，ID:', asset.assetId);
        
        // 确保角色位置正确（X:247, Y:-196）
        if (typeof logoTarget.setXY === 'function') {
            logoTarget.setXY(247, -196);
            console.log('[随机默认造型] 已设置角色位置到 (247, -196)');
        } else if (logoTarget.sprite) {
            logoTarget.sprite.x = 247;
            logoTarget.sprite.y = -196;
            console.log('[随机默认造型] 已直接设置 sprite 位置到 (247, -196)');
        }
        
        // 强制触发视觉更新
        if (typeof logoTarget.emitVisualChange === 'function') {
            logoTarget.emitVisualChange();
        }
        
        // 触发目标更新
        if (typeof vm.emitTargetsUpdate === 'function') {
            vm.emitTargetsUpdate();
            console.log('[随机默认造型] 已触发目标更新');
        }
        
        // 请求重绘
        if (vm.runtime && typeof vm.runtime.requestRedraw === 'function') {
            vm.runtime.requestRedraw();
            console.log('[随机默认造型] 已请求重绘');
        }
        
        console.log('[随机默认造型] ✅ 替换成功！');
        
    } catch (err) {
        // 静默失败，保持默认造型
        console.warn('[随机默认造型] 加载失败:', err.message, err);
    }
};

export default loadRandomDefaultCostume;
