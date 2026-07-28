/* eslint-disable */
import client from './client.js';

// 上传文件到资源服务。POST /resources/upload（multipart/form-data，字段名 file）
// 返回 { id, kind, fileType, filename, url, ... }，其中 id 即作品接口的 fileResourceId / coverResourceId。
export async function uploadFile (file) {
    const form = new FormData();
    form.append('file', file);
    // 不要手动设置 Content-Type：上传 FormData 时浏览器会自动加上
    // multipart/form-data 及正确的 boundary，写死反而会解析失败。
    const {data} = await client.post('/resources/upload', form);
    return data;
}

// 将资源设为「无需登录即可下载」。
// 作品广场的作品会被 Turbowarp 嵌入播放器匿名加载，若资源 requireLogin=true，
// 匿名请求会被论坛拦截（返回登录页而非 SB3），Turbowarp 解析那段 HTML 即报
// "Could not parse as a valid SB2 or SB3 project / missing meta.semver"。
// 故发布/上传封面后都应关闭该限制。
export async function setResourcePublic (id) {
    if (!id) return null;
    const {data} = await client.patch(`/resources/${id}`, {requireLogin: false});
    return data;
}

// 上传前校验生成的确实是合法 SB3（zip 且 project.json 含 meta.semver），
// 校验口径与 Turbowarp 嵌入播放器一致，可提前拦截坏文件避免发布后无法嵌入。
export async function validateSb3Blob (blob) {
    if (!blob || blob.size < 4) {
        return {ok: false, error: '生成的文件为空，无法发布'};
    }
    const buf = await blob.arrayBuffer();
    // 1) ZIP 魔数 PK\x03\x04
    if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        return {ok: false, error: '生成的文件不是有效的 SB3 压缩包（缺少 ZIP 头部），请重试或保存后重新打开再发布'};
    }
    // 2) 进一步校验内部 project.json 的 meta.semver
    try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buf);
        const pj = zip.file('project.json');
        if (!pj) return {ok: false, error: 'SB3 压缩包内缺少 project.json'};
        const obj = JSON.parse(await pj.async('string'));
        if (!obj.meta || !obj.meta.semver) {
            return {ok: false, error: 'SB3 的 project.json 缺少 meta.semver，作品将无法被嵌入播放器解析'};
        }
        return {ok: true};
    } catch (e) {
        return {ok: false, error: 'SB3 校验失败：' + (e && e.message ? e.message : String(e))};
    }
}

