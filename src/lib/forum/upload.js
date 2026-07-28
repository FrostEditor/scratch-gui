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
