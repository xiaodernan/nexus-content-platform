/**
 * Reading a tool argument the registry has ALREADY validated.
 *
 * <p>Tool arguments arrive as `unknown` because the registry checks them against the tool's
 * `ToolArgSpec` BEFORE the implementation ever sees them: a declared `string` arg that is not a
 * string is refused at the door (`arg "x" expected string, got number`), and an arg nobody
 * declared is refused too (`unknown arg "y"`). The implementation therefore knows its own
 * arguments' types — the type system does not, because that guarantee lives at runtime.
 *
 * <p>`String(arg)` is the wrong bridge across that gap: on an object it prints
 * `[object Object]`, which is not a path, not a filter and not a name — it is a lie, and it
 * flows downstream into a path join or a prefix comparison. These helpers say what they mean:
 * a string is returned as itself, anything else is the fallback.
 */

/** A string argument, or `fallback` when the value is not a string. */
export function stringArg(args: Record<string, unknown>, name: string, fallback = ''): string {
  const v = args[name];
  return typeof v === 'string' ? v : fallback;
}

/**
 * A `string[]` argument (the spec type `string[]`), or `fallback` when the value is not an
 * array of strings.
 */
export function stringArrayArg(args: Record<string, unknown>, name: string, fallback: string[] = []): string[] {
  const v = args[name];
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback;
}
