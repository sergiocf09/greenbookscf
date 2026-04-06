import React from 'react';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 32 }) => {
  const aspectRatio = 180 / 50;
  const width = height * aspectRatio;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Golf hole "G" symbol - using arc path for proper G shape */}
      <g>
        {/* G shape as arc (open circle) - dark green stroke */}
        <path
          d="M40 8 A20 20 0 1 0 40 25"
          stroke="#006747"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Inner green surface */}
        <circle cx="25" cy="25" r="14" fill="#008C5E" />
        {/* Hole */}
        <ellipse cx="25" cy="27" rx="5" ry="3" fill="#003D2B" />
        {/* Flag pole */}
        <line x1="25" y1="10" x2="25" y2="27" stroke="white" strokeWidth="1.2" />
        {/* Red flag */}
        <path d="M25 10 L33 13.5 L25 17 Z" fill="#CC2200" />
        {/* G horizontal bar - gold */}
        <line x1="25" y1="25" x2="42" y2="25" stroke="#FCE300" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* GreenBook text */}
      <text
        x="52"
        y="30"
        fontFamily="'Arial Black', 'Helvetica Neue', sans-serif"
        fontSize="22"
        fontWeight="800"
        fill="white"
        letterSpacing="0.3"
      >
        GreenBook
      </text>

      {/* by SCF subtitle */}
      <text
        x="52"
        y="43"
        fontFamily="Arial, 'Helvetica Neue', sans-serif"
        fontSize="9"
        fontWeight="700"
        fill="#FCE300"
        letterSpacing="1"
      >
        by SCF
      </text>
    </svg>
  );
};

export default GreenBookLogo;
