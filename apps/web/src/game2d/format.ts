/** `{name}` 占位替换：两份语字共用同一份安全的替换逻辑 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}
