import React from 'react';

// [scratch-paint] eager-load
let realScratchPaint;
const getRealScratchPaint = () => {
    if (!realScratchPaint) {
        realScratchPaint = require('scratch-paint');
    }
    return realScratchPaint;
};

// Eagerly load scratch-paint on module init so its IIFE runs at app startup
realScratchPaint = require('scratch-paint');

const PaintEditor = props => React.createElement(getRealScratchPaint().default, props);

let hasSetupReducer = false;
const ScratchPaintReducer = (state, action) => {
    if (!hasSetupReducer && action.type === 'scratch-gui/navigation/ACTIVATE_TAB' && action.activeTabIndex === 1) {
        hasSetupReducer = true;
    }
    if (hasSetupReducer) {
        return getRealScratchPaint().ScratchPaintReducer(state, action);
    }
    return {};
};

export {
    PaintEditor as default,
    ScratchPaintReducer
};
