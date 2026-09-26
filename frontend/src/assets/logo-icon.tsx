import React from 'react';

interface LogoIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export default function LogoIcon({ className, ...props }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Shield shape */}
      <path
        d="M16 2L4 7v9c0 7.73 5.11 14.26 12 16 6.89-1.74 12-8.27 12-16V7L16 2z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M16 2L4 7v9c0 7.73 5.11 14.26 12 16 6.89-1.74 12-8.27 12-16V7L16 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Lock body */}
      <rect
        x="11"
        y="13"
        width="10"
        height="8"
        rx="1.5"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Lock shackle */}
      <path
        d="M13 13V10.5a3 3 0 016 0V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Keyhole */}
      <circle cx="16" cy="17" r="1.2" fill="currentColor" opacity="0.15" />
    </svg>
  );
}
