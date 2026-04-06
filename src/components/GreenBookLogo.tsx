import React from 'react';
import circleLightSrc from '@/assets/greenbook-icon-circle-light.png';
import circleDarkSrc from '@/assets/greenbook-icon-circle-dark.png';
import { useTheme } from 'next-themes';

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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const circleSrc = isDark ? circleDarkSrc : circleLightSrc;
  const circleSize = variant === 'auth' ? height * 0.65 : height * 0.7;
  const textSize = variant === 'auth' ? height * 0.1 : height * 0.15;
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
            ? 'font-serif italic tracking-wide dark:text-[hsl(43,75%,55%)] text-primary mt-2'
            : 'font-bold tracking-wide text-primary-foreground dark:text-primary-foreground mt-1'
        }
        style={{ fontSize: textSize, lineHeight: 1.1 }}
      >
        GreenBook
      </span>
      {variant === 'auth' && (
        <span
          className="font-serif italic tracking-widest dark:text-[hsl(43,75%,55%)] text-primary mt-0.5"
          style={{ fontSize: subTextSize, lineHeight: 1.2 }}
        >
          by SCF
        </span>
      )}
    </div>
  );
};

export default GreenBookLogo;
