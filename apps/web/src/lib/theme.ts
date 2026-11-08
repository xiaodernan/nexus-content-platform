export type NexusTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'nexus-theme';

export function isTheme(value: string | null | undefined): value is NexusTheme {
  return value === 'dark' || value === 'light';
}

/** 显式选择优先；没有存过就跟随系统。返回的值永远是两套主题之一，不把 'system' 带进渲染。 */
export function resolveTheme(stored: string | null | undefined, prefersLight: boolean): NexusTheme {
  if (isTheme(stored)) return stored;
  return prefersLight ? 'light' : 'dark';
}
