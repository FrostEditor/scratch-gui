/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import ForumAuthModal from './forum-auth-modal.jsx';
import PublishProjectModal from './publish-project-modal.jsx';
import ForumMyWorksModal from './forum-my-works-modal.jsx';

const btn = {
    border: '1px solid #d9d9d9', background: '#fff', color: '#333',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, marginLeft: 6
};
const btnPrimary = {
    border: 'none', background: '#1a73e8', color: '#fff',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, marginLeft: 6
};

const menuItemBase = {
    padding: '10px 14px', fontSize: 13, cursor: 'pointer', color: '#333', whiteSpace: 'nowrap'
};

function MenuRow ({children, onClick}) {
    const [hover, setHover] = React.useState(false);
    return (
        <div
            style={{...menuItemBase, background: hover ? '#f2f6fd' : '#fff'}}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {children}
        </div>
    );
}

class ForumUserCard extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            authOpen: false, authMode: 'login',
            publishOpen: false, menuOpen: false, avatarOk: true,
            myWorksOpen: false, publishProject: null
        };
    }
    openLogin = () => this.setState({authOpen: true, authMode: 'login'});
    openRegister = () => this.setState({authOpen: true, authMode: 'register'});
    onAuthSuccess = (user) => {
        this.setState({authOpen: false, menuOpen: false, avatarOk: true});
        if (user) this.props.onSetForumUser(user);
    };
    onLogout = () => {
        this.setState({menuOpen: false});
        this.props.onLogoutForumUser();
    };
    openPublish = () => this.setState({publishOpen: true, menuOpen: false});
    openMyWorks = () => this.setState({myWorksOpen: true, menuOpen: false});
    onEditWork = (p) => this.setState({publishOpen: true, publishProject: p, myWorksOpen: false});
    toggleMenu = () => this.setState(s => ({menuOpen: !s.menuOpen}));
    render () {
        const {forumUser} = this.props;
        const user = forumUser && forumUser.user;
        const loggedIn = !!user;
        const name = user ? (user.displayName || user.username) : '';
        const letter = (name[0] || 'U').toUpperCase();
        return (
            <span style={{display: 'inline-flex', alignItems: 'center'}}>
                {!loggedIn ? (
                    <>
                        <button style={btn} onClick={this.openLogin}>登录</button>
                        <button style={btnPrimary} onClick={this.openRegister}>注册</button>
                    </>
                ) : (
                    <span
                        style={{position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 6}}
                        onClick={this.toggleMenu}
                    >
                        <span style={{position: 'relative', width: 28, height: 28, display: 'inline-block'}}>
                            <span style={{
                                width: 28, height: 28, borderRadius: '50%', background: '#1a73e8',
                                color: '#fff', display: 'inline-flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 13
                            }}>
                                {letter}
                            </span>
                            {user.avatar && this.state.avatarOk && (
                                <img
                                    src={user.avatar}
                                    alt=""
                                    onError={() => this.setState({avatarOk: false})}
                                    style={{position: 'absolute', inset: 0, width: 28, height: 28, borderRadius: '50%'}}
                                />
                            )}
                        </span>
                        <span style={{fontSize: 13, color: '#333'}}>{name}</span>
                        {this.state.menuOpen && (
                            <div style={{
                                position: 'absolute', top: 36, right: 0, background: '#fff',
                                border: '1px solid #eee', borderRadius: 8,
                                boxShadow: '0 6px 20px rgba(0,0,0,0.15)', minWidth: 140,
                                zIndex: 2100, overflow: 'hidden'
                            }}>
                                <MenuRow onClick={this.openPublish}>发布作品</MenuRow>
                                <MenuRow onClick={this.openMyWorks}>我的作品</MenuRow>
                                <MenuRow onClick={this.onLogout}>退出登录</MenuRow>
                            </div>
                        )}
                    </span>
                )}
                {this.state.authOpen && (
                    <ForumAuthModal
                        open
                        mode={this.state.authMode}
                        onModeChange={(m) => this.setState({authMode: m})}
                        onClose={() => this.setState({authOpen: false})}
                        onSuccess={this.onAuthSuccess}
                    />
                )}
                {this.state.publishOpen && (
                    <PublishProjectModal
                        open
                        project={this.state.publishProject}
                        onClose={() => this.setState({publishOpen: false, publishProject: null})}
                    />
                )}
                {this.state.myWorksOpen && (
                    <ForumMyWorksModal
                        open
                        onClose={() => this.setState({myWorksOpen: false})}
                        onEdit={this.onEditWork}
                    />
                )}
            </span>
        );
    }
}

ForumUserCard.propTypes = {
    forumUser: PropTypes.shape({
        user: PropTypes.object,
        loggedIn: PropTypes.bool,
        status: PropTypes.string
    }),
    onSetForumUser: PropTypes.func,
    onLogoutForumUser: PropTypes.func
};

export default ForumUserCard;
