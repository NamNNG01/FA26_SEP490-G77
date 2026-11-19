/**
 * A subscription plan's description is written as sentences; each one is shown
 * on its own line. A sentence ends at a "." followed by whitespace or the end
 * of the text, or at a line break — so "1.5M tokens" or "v2.0" stay whole.
 */
export function planDescriptionLines(description: string | null | undefined): string[] {
  if (!description) return [];
  return description
    .split(/\.(?=\s|$)|\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * Lines to show for a plan: its description, then the old feature list of
 * plans saved before the description replaced it (empty once re-saved).
 */
export function planLines(plan: { description?: string | null; features?: string[] | null }): string[] {
  return [...planDescriptionLines(plan.description), ...(plan.features ?? []).map(f => f.trim()).filter(Boolean)];
}

/** Description text holding the same lines as {@link planLines}, one sentence each. */
export function planLinesToDescription(lines: string[]): string {
  return lines.map(line => (line.endsWith('.') ? line : `${line}.`)).join(' ');
}
