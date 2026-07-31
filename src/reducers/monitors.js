const UPDATE_MONITORS = 'scratch-gui/monitors/UPDATE_MONITORS';

const initialState = null;

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case UPDATE_MONITORS: {
        const next = action.monitors;
        // The VM emits MONITORS_UPDATE every animation frame. If every monitor's
        // value is identical to the previous frame, keep the old reference so
        // connected components (and the React.memo'd MonitorList) can bail out of
        // re-rendering entirely instead of rebuilding the whole list each frame.
        if (state && state.size === next.size) {
            let changed = false;
            next.forEach((value, key) => {
                if (state.get(key) !== value) changed = true;
            });
            if (!changed) return state;
        }
        return next;
    }
    default:
        return state;
    }
};

const updateMonitors = function (monitors) {
    return {
        type: UPDATE_MONITORS,
        monitors: monitors
    };
};

export {
    reducer as default,
    initialState as monitorsInitialState,
    updateMonitors
};
