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
          {label && <label htmlFor={inputId} className="text-[13px] font-medium text-[#374151]">{label}</label>}
          {labelAction}
        </div>
      )}
      <div className="relative flex items-center">
        {icon && <span className="absolute left-3 text-[#9CA3AF] w-4 h-4 flex items-center">{icon}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`w-full h-9 rounded-[10px] border text-[14px] text-[#111827] placeholder:text-[#9CA3AF] bg-white transition-all
            focus:outline-none focus:ring-2 focus:ring-[#0D7C6C]/20 focus:border-[#0D7C6C]
            ${error ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}
            ${icon ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`}
          {...props}
        />
        {suffix && <span className="absolute right-3 flex items-center text-[#9CA3AF]">{suffix}</span>}
      </div>
      {error && <p id={messageId} className="text-[12px] text-[#DC2626]">{error}</p>}
      {hint && !error && <p id={messageId} className="text-[12px] text-[#6B7280]">{hint}</p>}
    </div>
  );
}
