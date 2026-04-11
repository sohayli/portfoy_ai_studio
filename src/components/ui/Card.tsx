import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, hover = false, children, ...props }) => {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 transition-all',
        hover && 'hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none hover:-translate-y-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
