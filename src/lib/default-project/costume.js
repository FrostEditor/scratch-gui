// ★ 生成空白舞台背景（只有主题色，无图案无文字）

const generateBackdrop = () => {
    const theme = (() => {
        try {
            const themeStr = localStorage.getItem('tw:theme');
            if (!themeStr || themeStr === 'undefined' || themeStr === 'null') {
                return { gui: 'dark', accent: 'frosteditor' };
            }
            return JSON.parse(themeStr);
        } catch (e) {
            return { gui: 'dark', accent: 'frosteditor' };
        }
    })();

    const getBG = () => {
        try {
            if (theme.gui == 'light') return '#ffffff'
            return '#000000'
        } catch { return '#000000' }
    }

    return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
        width="480" height="360" viewBox="0,0,480,360">
        <rect width="480" height="360" fill="${getBG()}" />
    </svg><!--rotationCenter:240:180-->`
};

export default generateBackdrop;