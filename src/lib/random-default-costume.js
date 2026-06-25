// 随机二次元图片默认造型
// 从 API 获取随机二次元图片，替换 LOGO 角色的默认造型

const RANDOM_IMAGE_API = 'https://api.yppp.net/pc.php?return=json';

/**
 * 加载随机二次元图片并替换 LOGO 角色的默认造型
 * @param {VirtualMachine} vm - Scratch VM 实例
 */
const loadRandomDefaultCostume = async (vm) => {
    try {
        console.log('[随机默认造型] 开始加载...');
        
        // 检查 VM 是否准备好
        if (!vm || !vm.runtime) {
            console.warn('[随机默认造型] VM 未准备好');
            return;
        }
        
        if (!vm.runtime.storage) {
            console.warn('[随机默认造型] storage 未准备好');
            return;
        }
        
        // 找到 LOGO 角色
        const targets = vm.runtime.targets || [];
        console.log('[随机默认造型] 目标数量:', targets.length);
        
        const logoTarget = targets.find(t => {
            const spriteName = t.sprite?.name || t.name;
            console.log('[随机默认造型] 角色:', spriteName, 'isStage:', t.isStage);
            return !t.isStage && spriteName === 'LOGO';
        });
        
        if (!logoTarget) {
            console.warn('[随机默认造型] 未找到 LOGO 角色');
            // 1秒后重试一次
            setTimeout(() => loadRandomDefaultCostume(vm), 1000);
            return;
        }
        
        console.log('[随机默认造型] 找到 LOGO 角色');
        
        if (!logoTarget.sprite?.costumes || logoTarget.sprite.costumes.length === 0) {
            console.warn('[随机默认造型] LOGO 角色没有造型');
            return;
        }
        
        const storage = vm.runtime.storage;
        
        // 添加随机参数避免缓存
        const randomParam = Date.now() + Math.random();
        const apiUrl = `${RANDOM_IMAGE_API}&_=${randomParam}`;
        
        console.log('[随机默认造型] 请求 API:', apiUrl);
        
        // 从 API 获取随机图片信息
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.warn('[随机默认造型] API 请求失败:', response.status);
            return;
        }
        
        const data = await response.json();
        console.log('[随机默认造型] API 返回:', data);
        
        if (data.code !== '200' || !data.acgurl) {
            console.warn('[随机默认造型] API 返回数据无效');
            return;
        }
        
        // 加载图片
        console.log('[随机默认造型] 加载图片:', data.acgurl);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (e) => {
                console.warn('[随机默认造型] 图片加载失败', e);
                reject(e);
            };
            img.src = data.acgurl;
        });
        
        console.log('[随机默认造型] 图片加载成功，尺寸:', img.width, 'x', img.height);
        
        // 将图片绘制到 canvas 上，调整大小以适应舞台（480x360）
        const canvas = document.createElement('canvas');
        const targetWidth = 480;
        const targetHeight = 360;
        
        canvas.width = targetWidth * 2; // 2x 分辨率，更清晰
        canvas.height = targetHeight * 2;
        
        const ctx = canvas.getContext('2d');
        
        // 计算缩放比例，保持图片比例，居中裁剪
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        
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
        
        // 转换为 PNG blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const arrayBuffer = await blob.arrayBuffer();
        
        console.log('[随机默认造型] PNG 数据大小:', arrayBuffer.byteLength, '字节');
        
        // 创建位图 asset
        const asset = storage.createAsset(
            storage.AssetType.ImageBitmap,
            storage.DataFormat.PNG,
            new Uint8Array(arrayBuffer),
            null, // 自动生成 assetId
            true // 生成 md5
        );
        
        console.log('[随机默认造型] Asset 创建成功，ID:', asset.assetId);
        
        // 替换第一个造型
        const costume = logoTarget.sprite.costumes[0];
        const oldAssetId = costume.assetId;
        
        console.log('[随机默认造型] 旧造型:', oldAssetId, '新造型:', asset.assetId);
        
        // 更新造型属性
        costume.assetId = asset.assetId;
        costume.md5ext = `${asset.assetId}.png`;
        costume.dataFormat = 'png';
        costume.bitmapResolution = 2; // 2x 分辨率
        costume.rotationCenterX = targetWidth / 2;
        costume.rotationCenterY = targetHeight / 2;
        costume.size = [canvas.width, canvas.height];
        
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
        
        // 强制刷新当前造型
        if (logoTarget.setCostume) {
            logoTarget.setCostume(0);
            console.log('[随机默认造型] 已重新设置造型');
        }
        
        console.log('[随机默认造型] ✅ 替换成功！');
        
    } catch (err) {
        // 静默失败，保持默认造型
        console.warn('[随机默认造型] 加载失败:', err.message, err);
    }
};

export default loadRandomDefaultCostume;
