/** UTF-8 size, as the BE counts the 100 KB limit. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
