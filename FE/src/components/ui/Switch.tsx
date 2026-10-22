import React from "react";

export function Switch({
  checked,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const w = size === "sm" ? "w-8 h-4" : "w-11 h-6";
  const knob =
    size === "sm" ? "w-3 h-3 translate-x-0.5" : "w-5 h-5 translate-x-0.5";
  const on = size === "sm" ? "translate-x-[17px]" : "translate-x-[21px]";

  return (
    <label
      className={`flex items-center gap-2 select-none ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      onClick={() => {
        if (!disabled) onChange?.(!checked);
      }}
      aria-disabled={disabled}
    >
      <div
        className={`${w} rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-fill-strong"
        } ${disabled ? "cursor-not-allowed" : ""} relative`}
      >
        <div
          className={`${knob} bg-surface rounded-full shadow absolute top-0.5 transition-transform ${
            checked ? on : ""
          }`}
        />
      </div>
      {label && (
        <span className="text-base text-content-secondary">{label}</span>
      )}
    </label>
  );
}
