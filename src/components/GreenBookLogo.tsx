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
      {/* Golf hole "G" symbol */}
      <g>
        {/* Outer circle - dark green */}
        <circle cx="25" cy="25" r="23" stroke="#006747" strokeWidth="4" fill="none" />
        {/* Inner green fill */}
        <circle cx="25" cy="25" r="19" fill="#006747" />
        {/* Green surface - lighter */}
        <circle cx="25" cy="25" r="15" fill="#008C5E" />
        {/* Hole */}
        <ellipse cx="25" cy="27" rx="5" ry="3" fill="#003D2B" />
        {/* Flag pole */}
        <line x1="25" y1="10" x2="25" y2="27" stroke="white" strokeWidth="1.2" />
        {/* Red flag */}
        <path d="M25 10 L33 13.5 L25 17 Z" fill="#CC2200" />
        {/* G horizontal bar - gold */}
        <rect x="25" y="22" width="16" height="3.5" rx="1.5" fill="#FCE300" />
        {/* G opening gap (cut into circle) */}
        <rect x="37" y="8" width="12" height="14" fill="none" />
        {/* Cut the top-right of circle to form G shape */}
        <path
          d="M38 4 L50 4 L50 22 L38 22 Z"
          fill="currentColor"
          className="fill-background"
        />
      </g>

      {/* GreenBook text */}
      <text
        x="58"
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
        x="58"
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
