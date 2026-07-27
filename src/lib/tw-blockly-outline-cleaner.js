/**
 * tw: 彻底、永久地清除「积木编辑器（blockly 工作区）/ 舞台」在获得焦点时浏览器绘制的
 * 蓝色矩形焦点轮廓。
 *
 * 为什么用 JS 而不是 CSS：
 * - 之前的方案是在 global-styles.css 里用 `:global(.blocklyWorkspace:focus) { outline: none }`，
 *   但 blockly 工作区是动态注入的 SVG，`<g class="blocklyWorkspace">` / `<svg class="blocklySvg">`
 *   在获得焦点时浏览器画的 focus ring 对 CSS `outline` 并不一定服从（尤其 SVG 元素），
 *   导致「退出原生全屏后蓝色矩形反复出现」。
 * - 这里改用 JS 直接给元素设置 inline style `outline:none`（优先级最高，胜过 UA 默认样式与
 *   任何 CSS），并监听全局 `focusin`（捕获阶段，先于 blockly 自身）与相关元素出现（MutationObserver），
 *   做到「只要这些元素获得焦点就立刻清掉轮廓」，不依赖脆弱的 CSS 选择器。
 *
 * 影响范围仅限积木工作区与舞台相关元素，不破坏页面其它控件的键盘焦点指示。
 */

// 需要清除焦点轮廓的目标元素
const SELECTOR = [
    '.blocklyWorkspace',
    '.blocklySvg',
    '.blocklyMainBackground',
    '.blocklyCanvas',
    '.blocklyWidgetDiv',
    '[data-stage-fullscreen-target]',
    '.stage-canvas-wrapper',
    '.stage'
].join(',');

let initialized = false;

const clearElement = (el) => {
    if (!el || !el.style) return;
    // 只触及已知目标，避免影响其它可见 focus 指示（无障碍）
    el.style.outline = 'none';
    el.style.outlineOffset = '0';
    el.style.boxShadow = 'none';
};

/**
 * 立即清除当前文档中所有匹配元素的焦点轮廓（供全屏进入/退出时调用）。
 */
export const clearNow = () => {
    try {
        const els = document.querySelectorAll(SELECTOR);
        for (let i = 0; i < els.length; i++) {
            clearElement(els[i]);
            // 递归清后代（blockly 的 <g> 等）
            const children = els[i].querySelectorAll('*');
            for (let j = 0; j < children.length; j++) {
                clearElement(children[j]);
            }
        }
    } catch (e) { /* ignore */ }
};

/**
 * 初始化一次：全局监听焦点与 DOM 变化，确保 blockly 工作区一旦获得焦点或被注入，
 * 其焦点轮廓立即被清除。
 */
export const init = () => {
    if (initialized || typeof document === 'undefined' || !document.body) return;
    initialized = true;

    // 1) 任何相关元素获得焦点（捕获阶段，先于默认行为）立即清轮廓
    const onFocusIn = (e) => {
        const t = e && e.target;
        if (t && t.matches && typeof t.matches === 'function' && t.matches(SELECTOR)) {
            clearElement(t);
        }
    };
    document.addEventListener('focusin', onFocusIn, true);

    // 2) blockly 工作区是动态注入的，用 MutationObserver 在其出现/变化时持续清轮廓
    if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => {
            clearNow();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // 3) 首次立即清一次
    clearNow();
};

export default { init, clearNow };
