import React from 'react';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 32 }) => {
  const aspectRatio = 180 / 40;
  const width = height * aspectRatio;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Wavy green with flag */}
      <g>
        {/* Wavy green surface */}
        <path
          d="M2 28 Q8 24, 14 26 Q20 28, 26 25 Q32 22, 38 26 L38 32 Q32 30, 26 32 Q20 34, 14 32 Q8 30, 2 32 Z"
          fill="hsl(150, 50%, 45%)"
        />
        {/* Flag pole */}
        <line
          x1="28"
          y1="10"
          x2="28"
          y2="26"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Red flag */}
        <path
          d="M28 10 L38 14 L28 18 Z"
          fill="hsl(0, 72%, 51%)"
        />
      </g>

      {/* GreenBook text */}
      <text
        x="46"
        y="24"
        fontFamily="Georgia, serif"
        fontSize="18"
        fontWeight="bold"
        fill="white"
        letterSpacing="0.5"
      >
        GreenBook
      </text>

      {/* by SCF text */}
      <text
        x="46"
        y="36"
        fontFamily="Arial, sans-serif"
        fontSize="9"
        fill="white"
        opacity="0.85"
        letterSpacing="1"
      >
        by SCF
      </text>
    </svg>
  );
};

export default GreenBookLogo;
