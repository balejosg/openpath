import * as React from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
  'transition-[transform,box-shadow,background-color,color,border-color] duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ' +
  'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ' +
  'active:translate-y-px';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-900 text-slate-50 shadow-sm shadow-slate-900/10 ' +
    'hover:bg-slate-800 hover:shadow-md hover:shadow-slate-900/15 ' +
    'active:bg-slate-900',
  secondary:
    'bg-white text-slate-900 border border-slate-200 shadow-sm shadow-slate-900/5 ' +
    'hover:bg-slate-50 hover:border-slate-300',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-100 active:bg-slate-200/70',
  danger:
    'bg-red-600 text-white shadow-sm shadow-red-600/15 ' +
    'hover:bg-red-500 hover:shadow-md hover:shadow-red-600/20 ' +
    'active:bg-red-600',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
