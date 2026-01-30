import React from 'react';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 32 }) => {
  const aspectRatio = 140 / 44;
  const width = height * aspectRatio;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 140 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Wavy green with flag */}
      <g>
        {/* Wavy green surface */}
        <path
          d="M2 30 Q8 26, 14 28 Q20 30, 26 27 Q32 24, 38 28 L38 36 Q32 34, 26 36 Q20 38, 14 36 Q8 34, 2 36 Z"
          fill="hsl(150, 50%, 45%)"
        />
        {/* Flag pole */}
        <line
          x1="28"
          y1="10"
          x2="28"
          y2="28"
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

      {/* Green text - first line */}
      <text
        x="46"
        y="18"
        fontFamily="Georgia, serif"
        fontSize="16"
        fontWeight="bold"
        fill="white"
        letterSpacing="0.5"
      >
        Green
      </text>

      {/* Book text - second line */}
      <text
        x="46"
        y="34"
        fontFamily="Georgia, serif"
        fontSize="16"
        fontWeight="bold"
        fill="white"
        letterSpacing="0.5"
      >
        Book
      </text>

      {/* by SCF text - bold, accent gold color */}
      <text
        x="88"
        y="34"
        fontFamily="Arial, sans-serif"
        fontSize="10"
        fontWeight="bold"
        fill="hsl(43, 90%, 50%)"
        letterSpacing="0.5"
      >
        by SCF
      </text>
    </svg>
  );
};

export default GreenBookLogo;
