import React from "react";
import { Icon } from "@/assets/icons";
import type { PasswordCheck } from "@/services/password.service";

/**
 * Live checklist under a new-password field: every rule at once, a green tick
 * for the ones met and red text for the rest. Before anything is typed the
 * rules are shown in a neutral colour.
 */
export function PasswordRequirements({
  id,
  checks,
  touched,
}: {
  id?: string;
  checks: PasswordCheck[];
  touched: boolean;
}) {
  return (
    <ul
      id={id}
      aria-label="Password requirements"
      className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 -mt-2 [@media(max-height:850px)]:-mt-1.5"
    >
      {checks.map((c) => {
        const tone = !touched ? "text-content-soft" : c.met ? "text-success" : "text-danger";
        return (
          <li key={c.id} className={`flex items-center gap-1.5 text-xs ${tone}`}>
            {touched && c.met ? (
              <Icon.Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            ) : (
              <span
                className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center"
                aria-hidden
              >
                <span className="w-1 h-1 rounded-full bg-current" />
              </span>
            )}
            <span>{c.label}</span>
            <span className="sr-only">{touched ? (c.met ? " — met" : " — not met") : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
