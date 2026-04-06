import React from 'react';
import circleSrc from '@/assets/greenbook-icon-circle.png';

interface GreenBookLogoProps {
  className?: string;
  height?: number;
  /** 
   * "header" = circle + "GreenBook" text below, no "by SCF"
   * "auth"   = circle + "GreenBook" + "by SCF" (golden in dark mode)
   */
  variant?: 'header' | 'auth';
}

const GreenBookLogo: React.FC<GreenBookLogoProps> = ({ className = '', height = 64, variant = 'header' }) => {
  const circleSize = variant === 'auth' ? height * 0.72 : height * 0.75;
  const textSize = variant === 'auth' ? height * 0.09 : height * 0.14;
  const subTextSize = variant === 'auth' ? height * 0.065 : 0;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img
        src={circleSrc}
        alt="GreenBook"
        style={{ height: circleSize, width: 'auto' }}
        className="block"
      />
      <span
        className={
          variant === 'auth'
            ? 'font-bold tracking-wide dark:text-[hsl(43,75%,55%)] text-primary mt-1'
            : 'font-bold tracking-wide text-primary-foreground dark:text-primary mt-0.5'
        }
        style={{ fontSize: textSize, lineHeight: 1.1 }}
      >
        GreenBook
      </span>
      {variant === 'auth' && (
        <span
          className="font-semibold tracking-widest dark:text-[hsl(43,75%,55%)] text-primary"
          style={{ fontSize: subTextSize, lineHeight: 1.2 }}
        >
          by SCF
        </span>
      )}
    </div>
  );
};

export default GreenBookLogo;
