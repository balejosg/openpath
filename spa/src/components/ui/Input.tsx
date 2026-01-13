import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, containerClassName, label, error, hint, id, required, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? `input-${reactId}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;

    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={cn('space-y-1.5', containerClassName)}>
        {label ? (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-900">
            {label}
            {required ? <span className="ml-1 text-slate-500">*</span> : null}
          </label>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 ' +
              'placeholder:text-slate-400 ' +
              'border-slate-200 shadow-sm shadow-slate-900/5 ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ' +
              'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-red-300 focus-visible:ring-red-400' : 'hover:border-slate-300',
            className,
          )}
          required={required}
          {...props}
        />

        {hint ? (
          <p id={hintId} className="text-xs text-slate-500">
            {hint}
          </p>
        ) : null}

        {error ? (
          <p id={errorId} className="text-xs font-medium text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
