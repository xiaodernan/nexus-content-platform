import { describe, expect, it } from 'vitest';
import { isTheme, resolveTheme, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * §120 主题判据的纯函数部分。
 *
 * 首帧脚本（`ThemeScript`）里那段内联 JS 与这里同一个判据，但它是字符串、测不了；
 * 所以判据本身必须留在这个纯函数里，脚本只做"读 localStorage + 调同一套规则"。
 * 这里钉三件事：显式选择优先、没有选择才看系统、非法值不能把主题带进第三种状态。
 */
describe('主题判据（§120）', () => {
  it('显式选择优先于系统偏好', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('没有存过就跟随系统', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme(undefined, true)).toBe('light');
  });

  it('非法值被当成没有选择，不会产生第三种主题', () => {
    for (const bad of ['', 'system', 'DARK', 'light ', '{}']) {
      expect(isTheme(bad)).toBe(false);
      expect(resolveTheme(bad, false)).toBe('dark');
      expect(resolveTheme(bad, true)).toBe('light');
    }
  });

  it('存储键只有一份', () => {
    expect(THEME_STORAGE_KEY).toBe('nexus-theme');
  });
});
