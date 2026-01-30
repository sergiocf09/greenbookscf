import React from 'react';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 32 }) => {
  const aspectRatio = 100 / 50;
  const width = height * aspectRatio;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Wavy green with flag */}
      <g>
        {/* Wavy green surface */}
        <path
          d="M2 32 Q8 28, 14 30 Q20 32, 26 29 Q32 26, 38 30 L38 40 Q32 38, 26 40 Q20 42, 14 40 Q8 38, 2 40 Z"
          fill="hsl(150, 50%, 45%)"
        />
        {/* Flag pole */}
        <line
          x1="28"
          y1="10"
          x2="28"
          y2="30"
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
        y="16"
        fontFamily="Georgia, serif"
        fontSize="14"
        fontWeight="bold"
        fill="white"
        letterSpacing="0.5"
      >
        Green
      </text>

      {/* Book text - second line */}
      <text
        x="46"
        y="30"
        fontFamily="Georgia, serif"
        fontSize="14"
        fontWeight="bold"
        fill="white"
        letterSpacing="0.5"
      >
        Book
      </text>

      {/* by SCF text - third line, bold, accent gold color */}
      <text
        x="46"
        y="42"
        fontFamily="Arial, sans-serif"
        fontSize="9"
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
