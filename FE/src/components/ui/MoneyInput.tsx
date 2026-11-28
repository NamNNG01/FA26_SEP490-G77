import React, { useLayoutEffect, useRef } from "react";
import { Input } from "./Input";

/** "22000" → "22.000" (vi-VN grouping). Non-digits are dropped. */
export function formatMoneyDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Whole-number VND as plain digits for form state: 22000.5 → "22000", null → "". */
export function moneyToDigits(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? String(n) : "";
}

type InputProps = React.ComponentProps<typeof Input>;

/**
 * VND amount field — whole numbers only, shown as "22.000" while typing.
 * `value` / `onValueChange` carry plain digits ("22000", or "" when empty).
 */
export function MoneyInput({
  value,
  onValueChange,
  max,
  preserveNegativeSign = false,
  suffix = "₫",
  ...props
}: Omit<InputProps, "value" | "onChange" | "type" | "max"> & {
  value: string;
  onValueChange: (digits: string) => void;
  /** Extra digits past this amount are ignored. */
  max?: number;
  /** Keep a negative entry intact so the form can ask the user to correct it. */
  preserveNegativeSign?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /** Digits left of the caret after the last edit — the caret is put back after them. */
  const caretDigits = useRef<number | null>(null);
  const display =
    (preserveNegativeSign && value.startsWith("-") ? "-" : "") + formatMoneyDigits(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretDigits.current === null || document.activeElement !== el) return;
    let pos = display.startsWith("-") ? 1 : 0;
    for (let seen = 0; pos < display.length && seen < caretDigits.current; pos++) {
      if (/\d/.test(display[pos])) seen++;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [display]);

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      suffix={suffix}
      value={display}
      onChange={(e) => {
        const typed = e.target.value;
        const caret = e.target.selectionStart ?? typed.length;
        const negative = preserveNegativeSign && /[-−]/.test(typed);
        let digits = typed.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (!negative && max !== undefined && digits !== "" && Number(digits) > max) return;
        caretDigits.current = typed.slice(0, caret).replace(/\D/g, "").length;
        if (digits.length > 15) digits = digits.slice(0, 15);
        onValueChange(negative ? `-${digits}` : digits);
      }}
    />
  );
}
