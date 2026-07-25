import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';

import styles from './onboarding.css';

// SVG 图标（不使用任何 emoji）
const IconSparkles = () => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M24 4L26.5 18.5L41 21L26.5 23.5L24 38L21.5 23.5L7 21L21.5 18.5L24 4Z"
            fill="currentColor"
            opacity="0.9"
        />
        <circle cx="38" cy="10" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="10" cy="38" r="2.5" fill="currentColor" opacity="0.4" />
    </svg>
);

const IconCode = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M11 8L4 16L11 24M21 8L28 16L21 24"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const IconStage = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="6" width="24" height="18" rx="2" stroke="currentColor" strokeWidth="2.5" />
        <path d="M12 28L16 24L20 28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="15" r="3" fill="currentColor" opacity="0.4" />
    </svg>
);

const IconSprite = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="12" r="6" stroke="currentColor" strokeWidth="2.5" />
        <path
            d="M6 27C6 22 10 19 16 19C22 19 26 22 26 27"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
        />
    </svg>
);

const IconCostume = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M16 4L26 10V22L16 28L6 22V10L16 4Z"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.5" />
    </svg>
);

const IconFlag = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M8 4V28M8 6C12 4 16 6 20 8C24 10 24 6 24 6V18C24 18 24 22 20 20C16 18 12 16 8 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </svg>
);

const IconExtension = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M14 4H18C19.1 4 20 4.9 20 6V10H24C25.1 10 26 10.9 26 12V16H22C20.9 16 20 16.9 20 18C20 19.1 20.9 20 22 20H26V24C26 25.1 25.1 26 24 26H20V22C20 20.9 19.1 20 18 20C16.9 20 16 20.9 16 22V26H12C10.9 26 10 25.1 10 24V20H6C4.9 20 4 19.1 4 18V14H8C9.1 14 10 13.1 10 12C10 10.9 9.1 10 8 10H4V6C4 4.9 4.9 4 6 4H10V8C10 9.1 10.9 10 12 10C13.1 10 14 9.1 14 8V4Z"
            fill="currentColor"
            opacity="0.85"
        />
    </svg>
);

const IconCheck = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M4 10L8 14L16 6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const IconArrowRight = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M4 10H16M16 10L11 5M16 10L11 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const IconUser = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="11" r="6" stroke="currentColor" strokeWidth="2.5" />
        <path
            d="M5 28C5 22 9 18 16 18C23 18 27 22 27 28"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
        />
    </svg>
);

const IconCompass = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.5" />
        <path
            d="M21 11L18 18L11 21L14 14L21 11Z"
            fill="currentColor"
            opacity="0.7"
        />
    </svg>
);

// localStorage 键名，用于判断是否为首次访问
const STORAGE_KEY = 'tw-onboarding-completed';

const ONBOARDING_STEPS = [
    {
        icon: IconCode,
        title: '代码编辑区',
        description: '这里是核心区域。从左侧积木库中拖拽积木到此处拼接，即可编写程序逻辑。积木按颜色分类：运动、外观、声音、事件、控制等。'
    },
    {
        icon: IconStage,
        title: '舞台区',
        description: '舞台是你作品的展示窗口。点击绿旗按钮运行程序，角色会在这里按你的指令表演。也可以点击红圈停止运行。'
    },
    {
        icon: IconSprite,
        title: '角色选择区',
        description: '管理你的角色。每个角色都有独立的代码、造型和声音。点击角色可切换编辑对象，上方加号可添加新角色。'
    },
    {
        icon: IconCostume,
        title: '标签页切换',
        description: '顶部标签页可在“代码”、“造型”、“声音”之间切换。造型页可以编辑角色外观，声音页可以录制或导入音频。'
    },
    {
        icon: IconFlag,
        title: '运行与停止',
        description: '舞台上方有绿旗和红色停止按钮。绿旗启动程序，停止按钮终止所有脚本。这是测试你作品最常用的操作。'
    },
    {
        icon: IconExtension,
        title: '扩展功能',
        description: '编辑器左下角的蓝色按钮可以添加扩展积木，包括音乐、画笔、视频感知、文本转语音等丰富功能。'
    }
];

class Onboarding extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            visible: false,
            phase: 'welcome', // 'welcome' | 'guide' | 'done'
            currentStep: 0
        };
    }

    componentDidMount () {
        // 延迟一点点，让主界面先渲染完成，引导再出现
        const timer = setTimeout(() => {
            const completed = localStorage.getItem(STORAGE_KEY);
            if (!completed) {
                this.setState({visible: true, phase: 'welcome'});
            }
        }, 800);
        this._timer = timer;
    }

    componentWillUnmount () {
        if (this._timer) clearTimeout(this._timer);
    }

    handleNewUser = () => {
        this.setState({phase: 'guide', currentStep: 0});
    };

    handleOldUser = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        this.setState({visible: false, phase: 'done'});
    };

    handleNextStep = () => {
        if (this.state.currentStep < ONBOARDING_STEPS.length - 1) {
            this.setState(prev => ({currentStep: prev.currentStep + 1}));
        } else {
            this.handleComplete();
        }
    };

    handlePrevStep = () => {
        if (this.state.currentStep > 0) {
            this.setState(prev => ({currentStep: prev.currentStep - 1}));
        }
    };

    handleSkip = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        this.setState({visible: false, phase: 'done'});
    };

    handleComplete = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        this.setState({visible: false, phase: 'done'});
    };

    renderWelcomePhase () {
        return (
            <div className={styles.welcomeContent}>
                <div className={styles.welcomeIcon}>
                    <IconSparkles />
                </div>
                <h2 className={styles.welcomeTitle}>欢迎来到创作编辑器</h2>
                <p className={styles.welcomeSubtitle}>
                    在这里，你可以用积木编程创造出动画、游戏和故事
                </p>

                <div className={styles.choiceRow}>
                    <button
                        className={styles.choiceCard}
                        onClick={this.handleNewUser}
                    >
                        <div className={styles.choiceIcon}>
                            <IconCompass />
                        </div>
                        <div className={styles.choiceText}>
                            <div className={styles.choiceTitle}>我是新用户</div>
                            <div className={styles.choiceDesc}>带我了解基本操作</div>
                        </div>
                        <div className={styles.choiceArrow}>
                            <IconArrowRight />
                        </div>
                    </button>

                    <button
                        className={styles.choiceCard}
                        onClick={this.handleOldUser}
                    >
                        <div className={styles.choiceIcon}>
                            <IconUser />
                        </div>
                        <div className={styles.choiceText}>
                            <div className={styles.choiceTitle}>我是老用户</div>
                            <div className={styles.choiceDesc}>直接进入编辑器</div>
                        </div>
                        <div className={styles.choiceArrow}>
                            <IconArrowRight />
                        </div>
                    </button>
                </div>

                <button className={styles.skipLink} onClick={this.handleSkip}>
                    跳过引导
                </button>
            </div>
        );
    }

    renderGuidePhase () {
        const step = ONBOARDING_STEPS[this.state.currentStep];
        const StepIcon = step.icon;
        const isLast = this.state.currentStep === ONBOARDING_STEPS.length - 1;

        return (
            <div className={styles.guideContent}>
                <div className={styles.guideHeader}>
                    <span className={styles.stepCounter}>
                        {this.state.currentStep + 1} / {ONBOARDING_STEPS.length}
                    </span>
                    <button className={styles.skipButton} onClick={this.handleSkip}>
                        跳过
                    </button>
                </div>

                <div className={styles.guideBody}>
                    <div className={styles.guideIcon}>
                        <StepIcon />
                    </div>
                    <h3 className={styles.guideTitle}>{step.title}</h3>
                    <p className={styles.guideDescription}>{step.description}</p>
                </div>

                <div className={styles.progressDots}>
                    {ONBOARDING_STEPS.map((_, i) => (
                        <div
                            key={i}
                            className={
                                i === this.state.currentStep
                                    ? styles.progressDotActive
                                    : i < this.state.currentStep
                                        ? styles.progressDotDone
                                        : styles.progressDot
                            }
                        >
                            {i < this.state.currentStep ? <IconCheck /> : null}
                        </div>
                    ))}
                </div>

                <div className={styles.guideFooter}>
                    <button
                        className={styles.secondaryButton}
                        onClick={this.handlePrevStep}
                        disabled={this.state.currentStep === 0}
                    >
                        上一步
                    </button>
                    <button
                        className={styles.primaryButton}
                        onClick={this.handleNextStep}
                    >
                        {isLast ? '开始创作' : '下一步'}
                        <IconArrowRight />
                    </button>
                </div>
            </div>
        );
    }

    render () {
        if (!this.state.visible) return null;

        return (
            <ReactModal
                isOpen
                className={styles.modal}
                overlayClassName={styles.overlay}
                contentLabel="新人引导"
                onRequestClose={this.handleSkip}
                shouldCloseOnOverlayClick={false}
            >
                <div className={styles.container}>
                    {this.state.phase === 'welcome'
                        ? this.renderWelcomePhase()
                        : this.state.phase === 'guide'
                            ? this.renderGuidePhase()
                            : null}
                </div>
            </ReactModal>
        );
    }
}

Onboarding.propTypes = {
    // 当前无需外部传入参数
};

export default Onboarding;
