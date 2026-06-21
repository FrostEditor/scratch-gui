import React from 'react';
import styles from './spinner.css';

const Loading = () => (
    <div className={styles.container}>
        <div className={styles.spinner}>
            <span className={styles.innerVisible}>❄</span>
        </div>
    </div>
);

export default Loading;
