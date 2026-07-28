/* eslint-disable */
import client from './client.js';

// 上传文件到资源服务。POST /resources/upload（multipart/form-data，字段名 file）
// 返回 { id, kind, fileType, filename, url, ... }，其中 id 即作品接口的 fileResourceId / coverResourceId。
export async function uploadFile (file) {
    const form = new FormData();
    form.append('file', file);
    const {data} = await client.post('/resources/upload', form, {
        headers: {'Content-Type': 'multipart/form-data'}
    });
    return data;
}
