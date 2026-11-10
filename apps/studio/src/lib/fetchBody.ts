/**
 * The body a fetch was called with, as text.
 *
 * <p>`RequestInit.body` is typed `BodyInit | null | undefined` — a string, a Blob, a FormData or a
 * stream. `String(body)` on the non-string shapes prints `[object Object]` (or worse), and
 * `JSON.parse` of that is a SyntaxError that names neither the call nor the field. This says what
 * it means: a string body is itself, and anything else is the empty text.
 *
 * <p>The tests here only ever send JSON strings, so the empty fallback is a claim they can check —
 * a body that was not a string shows up as an empty parse rather than as a mystery.
 */
export function bodyText(init: { body?: unknown } | null | undefined): string {
  const b = init?.body;
  return typeof b === 'string' ? b : '';
}
