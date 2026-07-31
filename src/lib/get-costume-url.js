import storage from './storage';
import {inlineSvgFonts} from '@turbowarp/scratch-svg-renderer';

// Contains 'font-family', but doesn't only contain 'font-family="none"'
const HAS_FONT_REGEXP = 'font-family(?!="none")';

// LRU cache keyed by assetId. The original single-slot cache thrashed (100% miss)
// when the sprite list rendered N different costumes in sequence, forcing N full
// base64 encodings / SVG font inlines per list render. A bounded Map fixes this.
const CACHE_LIMIT = 200;
const cache = new Map();

const getCostumeUrl = function (asset) {
    if (!asset) return undefined;

    const cached = cache.get(asset.assetId);
    if (cached !== undefined) {
        // Refresh LRU recency: delete then re-set moves it to the most-recent end.
        cache.delete(asset.assetId);
        cache.set(asset.assetId, cached);
        return cached;
    }

    let url;
    // If the SVG refers to fonts, they must be inlined in order to display correctly in the img tag.
    // Avoid parsing the SVG when possible, since it's expensive.
    if (asset.assetType === storage.AssetType.ImageVector) {
        const svgString = asset.decodeText();
        if (svgString.match(HAS_FONT_REGEXP)) {
            const svgText = inlineSvgFonts(svgString);
            url = `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
        } else {
            url = asset.encodeDataURI();
        }
    } else {
        url = asset.encodeDataURI();
    }

    if (cache.size >= CACHE_LIMIT) {
        // Evict oldest entry (first inserted in insertion-ordered Map).
        cache.delete(cache.keys().next().value);
    }
    cache.set(asset.assetId, url);
    return url;
};

export {
    getCostumeUrl as default,
    HAS_FONT_REGEXP
};
