/* eslint-disable */
const SET_PROJECT_BLOCK_TOTAL = 'scratch-gui/project-block-count/SET_PROJECT_BLOCK_TOTAL';

const initialState = {
    total: 0
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_PROJECT_BLOCK_TOTAL:
        return {
            total: typeof action.total === 'number' && action.total >= 0 ? action.total : 0
        };
    default:
        return state;
    }
};

const setProjectBlockTotal = total => ({
    type: SET_PROJECT_BLOCK_TOTAL,
    total
});

export {
    reducer as default,
    initialState,
    setProjectBlockTotal
};
