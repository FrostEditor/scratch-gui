/* eslint-disable */
const SET_FORUM_USER = 'forum/SET_FORUM_USER';
const LOGOUT_FORUM_USER = 'forum/LOGOUT_FORUM_USER';

export const forumUserInitialState = {
    user: null,
    loggedIn: false,
    status: 'idle' // idle | loading | ready | error
};

export default function reducer (state = forumUserInitialState, action = {}) {
    switch (action.type) {
    case SET_FORUM_USER:
        return {
            ...state,
            user: action.user,
            loggedIn: !!action.user,
            status: 'ready'
        };
    case LOGOUT_FORUM_USER:
        return {
            ...state,
            user: null,
            loggedIn: false,
            status: 'idle'
        };
    default:
        return state;
    }
}

export function setForumUser (user) {
    return {type: SET_FORUM_USER, user};
}

export function logoutForumUser () {
    return {type: LOGOUT_FORUM_USER};
}
