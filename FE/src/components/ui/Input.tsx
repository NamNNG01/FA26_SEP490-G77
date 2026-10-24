import React, { useId } from 'react';

export function Input({
  label, labelAction, error, hint, className = '', icon, suffix, id, ...props
}: {
  label?: string;
  /** Small inline action shown at the right end of the label row (e.g. "Forgot password?"). */
  labelAction?: React.ReactNode;
  error?: string; hint?: string; className?: string;
  icon?: React.ReactNode; suffix?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  // Tie the visible label (and error/hint text) to the input so screen
  // readers announce them and clicking the label focuses the field.
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || labelAction) && (
        <div className="flex items-center justify-between gap-2">
          {label && <label htmlFor={inputId} className="text-sm font-medium text-content-secondary">{label}</label>}
          {labelAction}
        </div>
      )}
      <div className="relative flex items-center">
        {icon && <span className="absolute left-3 text-content-subtle w-4 h-4 flex items-center">{icon}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`w-full h-9 rounded-[10px] border text-base text-content placeholder:text-content-subtle bg-surface transition-all
            focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600
            ${error ? 'border-danger-solid' : 'border-line'}
            ${icon ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`}
          {...props}
        />
        {suffix && <span className="absolute right-3 flex items-center text-content-subtle">{suffix}</span>}
      </div>
      {error && <p id={messageId} className="text-xs text-danger">{error}</p>}
      {hint && !error && <p id={messageId} className="text-xs text-content-soft">{hint}</p>}
    </div>
  );
}
