import React from 'react';
import logoSrc from '@/assets/greenbook-logo.png';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 32 }) => {
  return (
    <img
      src={logoSrc}
      alt="GreenBook by SCF"
      height={height}
      style={{ height, width: 'auto' }}
      className={className}
    />
  );
};

export default GreenBookLogo;
