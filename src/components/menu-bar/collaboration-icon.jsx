import React from 'react';

const CollaborationIcon = props => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        {...props}
    >
        {/* 第一个用户 */}
        <path
            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            fill="currentColor"
        />
        {/* 第二个用户 */}
        <path
            d="M18 13.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 1.5c-1.5 0-4.5.75-4.5 2.25V20h9v-2.75c0-1.5-3-2.25-4.5-2.25z"
            fill="currentColor"
            opacity="0.7"
        />
        {/* 连接/加号符号 */}
        <circle
            cx="15"
            cy="17"
            r="2.5"
            fill="white"
            stroke="currentColor"
            strokeWidth="1.5"
        />
        <path
            d="M15 15.5v3M13.5 17h3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
        />
    </svg>
);

export default CollaborationIcon;
