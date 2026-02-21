import React from 'react';

interface MoneyBagIconProps {
  className?: string;
}

const MoneyBagIcon: React.FC<MoneyBagIconProps> = ({ className = "h-4 w-4" }) => (
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
    {/* Bag tie / knot */}
    <path d="M9.5 5L12 2l2.5 3" />
    <path d="M8 5h8" />
    {/* Bag body */}
    <path d="M8 5C5 8 3 11 3 15c0 3.5 3.5 7 9 7s9-3.5 9-7c0-4-2-7-5-10" />
    {/* Dollar sign */}
    <path d="M12 11v6" />
    <path d="M10 13.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5-.9 1.5-2 1.5-2 .7-2 1.5.9 1.5 2 1.5 2-.7 2-1.5" />
  </svg>
);

export default MoneyBagIcon;
