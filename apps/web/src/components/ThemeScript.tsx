import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * 首帧之前把主题属性放上去，避免浅色用户先看到一帧暗色。
 *
 * 这个脚本必须**同步**执行（放在 body 的第一个子节点，解析器会先跑完它再画下面的内容），
 * 所以没有用 next/script 的 afterInteractive。内容与 `resolveTheme` 同一套判据：
 * 存过的显式选择优先，没存过才看系统偏好。
 */
export function ThemeScript() {
  const script =
    "(function(){try{var k='" +
    THEME_STORAGE_KEY +
    "';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-nexus-theme',t);}catch(e){}})();";
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
