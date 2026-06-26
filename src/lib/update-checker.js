// GitHub 更新检测工具
// 自动从 GitHub 获取最新 release 信息，检测是否有更新

const GITHUB_API = 'https://api.github.com/repos/FrostEditor/scratch-gui/releases/latest';
const LAST_SEEN_VERSION_KEY = 'frosteditor_last_seen_version';
const CURRENT_VERSION = process.env.npm_package_version || '3.2.37';

// 缓存结果，避免重复请求
let cachedReleaseInfo = null;
let hasChecked = false;

/**
 * 从 GitHub 获取最新 release 信息
 * @returns {Promise<Object|null>} 最新 release 信息，失败返回 null
 */
export async function fetchLatestRelease() {
    if (cachedReleaseInfo) {
        return cachedReleaseInfo;
    }
    
    try {
        const response = await fetch(GITHUB_API, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            console.warn('[更新检测] 获取 GitHub release 失败:', response.status);
            return null;
        }
        
        const data = await response.json();
        cachedReleaseInfo = data;
        return data;
    } catch (e) {
        console.warn('[更新检测] 请求失败:', e.message);
        return null;
    }
}

/**
 * 比较版本号
 * @param {string} v1 版本号1
 * @param {string} v2 版本号2
 * @returns {number} 1: v1 > v2, -1: v1 < v2, 0: 相等
 */
function compareVersions(v1, v2) {
    // 去掉前缀 v，比如 v1.2.3 -> 1.2.3
    const cleanV1 = v1.replace(/^v/, '').split('.').map(Number);
    const cleanV2 = v2.replace(/^v/, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(cleanV1.length, cleanV2.length); i++) {
        const n1 = cleanV1[i] || 0;
        const n2 = cleanV2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

/**
 * 检查是否有新版本
 * @returns {Promise<{hasUpdate: boolean, release: Object|null, isFirstSeen: boolean}>}
 */
export async function checkForUpdates() {
    if (hasChecked && cachedReleaseInfo) {
        const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
        const isFirstSeen = lastSeenVersion !== cachedReleaseInfo.tag_name;
        return {
            hasUpdate: compareVersions(cachedReleaseInfo.tag_name, CURRENT_VERSION) > 0,
            release: cachedReleaseInfo,
            isFirstSeen
        };
    }
    
    hasChecked = true;
    
    const release = await fetchLatestRelease();
    if (!release) {
        return { hasUpdate: false, release: null, isFirstSeen: false };
    }
    
    const hasUpdate = compareVersions(release.tag_name, CURRENT_VERSION) > 0;
    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    const isFirstSeen = lastSeenVersion !== release.tag_name;
    
    return { hasUpdate, release, isFirstSeen };
}

/**
 * 标记某个版本为已查看（下次启动不再弹窗）
 * @param {string} version 版本号
 */
export function markVersionAsSeen(version) {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
}

/**
 * 获取当前版本号
 * @returns {string}
 */
export function getCurrentVersion() {
    return CURRENT_VERSION;
}

export default {
    checkForUpdates,
    fetchLatestRelease,
    markVersionAsSeen,
    getCurrentVersion
};
