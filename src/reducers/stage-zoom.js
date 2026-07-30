const SET_STAGE_ZOOM = 'tw/stage-zoom/SET';

const STORAGE_KEY = 'twStageZoom';

const getStoredZoom = () => {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        const value = Number(raw);
        if (!isFinite(value) || value < 0.25 || value > 3) return null;
        return value;
    } catch (e) {
        return null;
    }
};

const defaultStageZoom = 1;

const initialState = getStoredZoom() || defaultStageZoom;

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_STAGE_ZOOM: {
        const zoom = Math.max(0.25, Math.min(3, action.zoom));
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, String(zoom));
            }
        } catch (e) {
            // ignore storage failures (e.g. private mode)
        }
        return zoom;
    }
    default:
        return state;
    }
};

const setStageZoom = function (zoom) {
    return {
        type: SET_STAGE_ZOOM,
        zoom
    };
};

export {
    reducer as default,
    defaultStageZoom,
    setStageZoom
};
