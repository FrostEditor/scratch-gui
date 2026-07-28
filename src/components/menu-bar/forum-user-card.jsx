/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import ForumAuthModal from './forum-auth-modal.jsx';
import PublishProjectModal from './publish-project-modal.jsx';
import ForumMyWorksModal from './forum-my-works-modal.jsx';
import {setCurrentProject} from '../../reducers/forum-current-project'; // tw: 记录当前关联的论坛作品

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

// 从作品对象构造「当前关联作品」记录（含所有者 id，便于菜单判断是否可更新）。
// 论坛 API 实际返回的所有者字段为 authorId（见 /projects/my 与 /projects/:id），
// 兼容 ownerId / owner.id 两种历史写法；都缺失时兜底为当前登录用户 id。
function buildCurrentProject (p, forumUser) {
    const ownerId = (p && (p.authorId || p.ownerId || (p.owner && p.owner.id))) ||
        (forumUser && forumUser.user && forumUser.user.id) || null;
    return {
        id: p.id,
        title: p.title,
        summary: p.summary,
        category: p.category,
        ownerId
    };
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
    openUpdate = () => this.setState({publishOpen: true, publishProject: this.props.currentProject, menuOpen: false});
    // 发布 / 更新成功后，把当前作品记到 redux，菜单栏据此显示「更新作品」。
    onPublished = (project) => {
        if (project && project.id) {
            this.props.onSetCurrentProject(buildCurrentProject(project, this.props.forumUser));
        }
    };
    // 从「我的作品」点「更新」：打开发布弹窗（更新模式）并记下当前作品。
    onEditWork = (p) => {
        this.setState({publishOpen: true, publishProject: p, myWorksOpen: false});
        if (p && p.id) this.props.onSetCurrentProject(buildCurrentProject(p, this.props.forumUser));
    };
    toggleMenu = () => this.setState(s => ({menuOpen: !s.menuOpen}));
    render () {
        const {forumUser, currentProject} = this.props;
        const user = forumUser && forumUser.user;
        const loggedIn = !!user;
        const name = user ? (user.displayName || user.username) : '';
        const letter = (name[0] || 'U').toUpperCase();
        // 仅当已登录、当前作品存在于社区、且当前用户是所有者时，才显示「更新作品」。
        const myId = user && user.id;
        const isOwner = !currentProject || !currentProject.ownerId || currentProject.ownerId === myId;
        const canUpdate = loggedIn && currentProject && currentProject.id && isOwner;
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
                                {canUpdate && (
                                    <MenuRow onClick={this.openUpdate}>更新作品</MenuRow>
                                )}
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
                        onPublished={this.onPublished}
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
    onLogoutForumUser: PropTypes.func,
    currentProject: PropTypes.object,
    onSetCurrentProject: PropTypes.func
};

const mapStateToProps = state => ({
    currentProject: state.scratchGui.forumCurrentProject
});
const mapDispatchToProps = dispatch => ({
    onSetCurrentProject: project => dispatch(setCurrentProject(project))
});

export default connect(mapStateToProps, mapDispatchToProps)(ForumUserCard);
