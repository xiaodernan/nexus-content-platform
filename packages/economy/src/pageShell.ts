/**
 * M7 v241 (ADR 0016 amendment 241) — the ONE HTML escaper the Studio's server-rendered pages share.
 *
 * Extracted from `artifact.ts` when the explore page (`/explore`) needed the same rule: a title, a project id
 * or a handle is caller-controlled text that lands in an attribute or a text node, so it is ESCAPED rather
 * than interpolated. Two copies of this would be two answers to "is this safe", and the two would drift — the
 * exact failure this repository keeps retiring (v140's two refusal tables, v135's one table read per plane).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
