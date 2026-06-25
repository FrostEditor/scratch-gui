/**
 * 随机默认造型加载器
 * 从 API 获取随机二次元图片，替换 LOGO 角色的默认造型
 */

const loadRandomDefaultCostume = async function (vm) {
    try {
        if (!vm || !vm.runtime || !vm.runtime.storage) {
            console.warn('[随机默认造型] VM 或 storage 不可用');
            return;
        }
        
        const storage = vm.runtime.storage;
        
        // 从 API 获取随机图片（带随机参数避免缓存）
        const apiUrl = `https://api.yppp.net/pc.php?return=json&t=${Date.now()}`;
        
        console.log('[随机默认造型] 开始加载随机图片...');
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API 请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.code !== '200' || !data.acgurl) {
            throw new Error('API 返回数据格式错误');
        }
        
        const imageUrl = data.acgurl;
        console.log('[随机默认造型] 获取到图片:', imageUrl);
        
        // 加载图片
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = imageUrl;
        });
        
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
        
        // 居中裁剪
        let sx, sy, sw, sh;
        if (imgRatio > targetRatio) {
            // 图片更宽，裁剪左右
            sh = img.height;
            sw = img.height * targetRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
        } else {
            // 图片更高，裁剪上下
            sw = img.width;
            sh = img.width / targetRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
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
        
        // 找到 LOGO 角色
        const targets = vm.runtime.targets;
        const logoTarget = targets.find(t => t.sprite && t.sprite.name === 'LOGO' && !t.isStage);
        
        if (!logoTarget) {
            console.warn('[随机默认造型] 找不到 LOGO 角色');
            return;
        }
        
        // 替换第一个造型
        const costume = logoTarget.sprite.costumes[0];
        const oldSkinId = costume.skinId;
        
        console.log('[随机默认造型] 旧皮肤:', oldSkinId, '新皮肤:', skinId);
        
        // 更新造型属性 - 核心：设置 skinId
        costume.skinId = skinId;
        costume.size = [skinSize[0] * 2, skinSize[1] * 2]; // 实际尺寸，位图都是 2x
        costume.bitmapResolution = 2;
        costume.rotationCenterX = rotationCenter[0] * 2;
        costume.rotationCenterY = rotationCenter[1] * 2;
        costume.dataFormat = 'png';
        
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
        
        // 确保角色在舞台中心
        if (logoTarget.sprite) {
            logoTarget.sprite.x = 0;
            logoTarget.sprite.y = 0;
            console.log('[随机默认造型] 已设置角色位置到中心');
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
