import React from 'react';

interface CoinDollarIconProps {
  className?: string;
}

const CoinDollarIcon: React.FC<CoinDollarIconProps> = ({ className = "h-4 w-4" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Dollar sign - vertical bar */}
    <path d="M12 3v18" />
    {/* Dollar sign - S curve */}
    <path d="M17 7c0-2.2-2.2-4-5-4S7 4.8 7 7s2.2 4 5 4 5 1.8 5 4-2.2 4-5 4-5-1.8-5-4" />
  </svg>
);

export default CoinDollarIcon;
