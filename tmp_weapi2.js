const crypto = require('crypto');
const https = require('https');

const modulus = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const pubKey = '010001';
const nonce = Buffer.from('0CoJUm6Qyw8W8jud');
const iv = Buffer.from('0102030405060708');
const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function aesCbc(text, key) {
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('base64');
}
function rsaEncrypt(text) {
  const rev = Buffer.from(text, 'utf8').reverse();
  let bi = BigInt('0x' + rev.toString('hex'));
  const pub = BigInt('0x' + pubKey);
  const mod = BigInt('0x' + modulus);
  let r = (bi ** pub) % mod;
  let hex = r.toString(16);
  while (hex.length < 256) hex = '0' + hex;
  return hex;
}
function weapi(obj) {
  const text = JSON.stringify(obj);
  let randomKey = '';
  for (let i = 0; i < 16; i++) randomKey += chars[crypto.randomBytes(1)[0] % 62];
  const encText = aesCbc(aesCbc(text, nonce), Buffer.from(randomKey));
  const encSecKey = rsaEncrypt(randomKey);
  return {params: encText, encSecKey};
}

function getCookieAndCsrf() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'music.163.com',
      path: '/',
      headers: {'User-Agent': 'Mozilla/5.0'}
    }, res => {
      const setCookie = res.headers['set-cookie'] || [];
      let csrf = '';
      for (const c of setCookie) {
        const m = c.match(/__csrf=([a-f0-9]+)/);
        if (m) csrf = m[1];
      }
      res.resume();
      resolve({csrf, cookie: setCookie.map(c => c.split(';')[0]).join('; ')});
    });
    req.on('error', reject);
  });
}

function postWeapi(songId, csrf, cookie) {
  return new Promise((resolve, reject) => {
    const body = weapi({ids: '[' + songId + ']', level: 'standard', encodeType: 'mp3', csrf_token: csrf || ''});
    const payload = 'params=' + encodeURIComponent(body.params) + '&encSecKey=' + encodeURIComponent(body.encSecKey);
    const req = https.request({
      hostname: 'music.163.com',
      path: '/weapi/song/enhance/player/url/v1?csrf_token=' + (csrf || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://music.163.com/',
        'Cookie': cookie || ''
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({raw: d}); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  const sid = 29775513;
  const {csrf, cookie} = await getCookieAndCsrf();
  console.log('csrf=', csrf);
  console.log('=== weapi WITH csrf (no login) ===');
  const r1 = await postWeapi(sid, csrf, cookie);
  console.log(JSON.stringify(r1.data && r1.data[0] ? {url: r1.data[0].url, code: r1.data[0].code, br: r1.data[0].br} : r1).slice(0, 300));
})();
