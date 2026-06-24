import React from 'react';
import PropTypes from 'prop-types';
import styles from './project-statement.css';

class ProjectStatement extends React.Component {
    constructor (props) {
        super(props);
        
        // 从 localStorage 读取作品声明
        const savedStatement = localStorage.getItem('projectStatement') || '';
        
        this.state = {
            statement: savedStatement
        };
        
        this.handleChange = this.handleChange.bind(this);
    }
    
    handleChange (e) {
        const value = e.target.value;
        this.setState({ statement: value });
        // 自动保存到 localStorage
        localStorage.setItem('projectStatement', value);
    }
    
    render () {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2>作品声明 / 使用说明</h2>
                    <p className={styles.description}>
                        在这里编写你的作品说明、使用方法、注意事项等内容。
                        <br />
                        内容会自动保存到本地。
                    </p>
                </div>
                <div className={styles.editor}>
                    <textarea
                        className={styles.textarea}
                        placeholder="在这里输入作品使用说明、操作指南、声明等内容..."
                        value={this.state.statement}
                        onChange={this.handleChange}
                    />
                </div>
                <div className={styles.footer}>
                    <span className={styles.charCount}>
                        字数：{this.state.statement.length}
                    </span>
                </div>
            </div>
        );
    }
}

ProjectStatement.propTypes = {
    vm: PropTypes.shape({})
};

export default ProjectStatement;
