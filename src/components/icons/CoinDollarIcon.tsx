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
    {/* Coin circle */}
    <circle cx="12" cy="12" r="10" />
    {/* Dollar sign */}
    <path d="M12 6v12" />
    <path d="M9 9.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 2-3 2-3 .9-3 2 1.3 2 3 2 3-.9 3-2" />
  </svg>
);

export default CoinDollarIcon;
