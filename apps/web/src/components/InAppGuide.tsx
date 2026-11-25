'use client';

import { useEffect, useMemo, useState } from 'react';
import { GUIDE_COPY } from '@/lib/guideCopy';
import type { Locale } from '@/lib/i18n';

/**
 * §SG-1 内置说明书（Studio 帮助抽屉 · Help Drawer）：
 *
 * 用户要的不是「会话之外的文档」，而是一个**打开项目就能看见**的说明书入口——
 * 在 Studio 顶栏上叫「帮助」，按到就弹出一整册「这个平台是什么、怎么用、怎么玩」，
 * 中英文一个按键切换本应被翻 ESL 的所有用户请求都能在抽屉里找到答案。
 *
 * 纪律：
 * - 文案真值只有 `@/lib/guideCopy` 一份——/guide 页与抽屉共用同一份内容
 *   （这就是这一片的意义：不再允许「文档写的一套、产品展示的一套」）；
 * - 整册仍是纯静态的账本数据，没有网络请求、没有大模型调用，按 F1/Esc 才开、或按顶栏「帮助」；
 * - 抽屉关掉之后模块卸载，不占 UI 长期开销；指针键 Esc/F1 关闭。
 */
export function InAppGuide({ locale = 'zh', open, onClose }: { locale?: Locale; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const copy = GUIDE_COPY[locale];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F1') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 仅按字面宽度收敛——不追求语义，只拒绝为「找内容」而增重算法
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return copy.sections;
    return copy.sections.filter(
      (s) => s.heading.toLowerCase().includes(q) || s.body.some((p) => p.toLowerCase().includes(q)),
    );
  }, [query, copy]);

  if (!open) return null;

  return (
    <aside className="tsg-drawer" role="dialog" aria-modal="true" aria-label={locale === 'zh' ? '帮助' : 'Help'} data-help-drawer>
      <header className="tsg-head">
        <div>
          <p className="tsg-kicker">{copy.kicker}</p>
          <h2 className="tsg-title">{copy.title}</h2>
          <p className="tsg-lede">{copy.lede}</p>
        </div>
        <button type="button" className="tsg-close" onClick={onClose} aria-label={locale === 'zh' ? '关闭' : 'Close'} data-help-close>
          {locale === 'zh' ? '关' : 'Close'}
        </button>
      </header>
      <div className="tsg-searchRow">
        <input
          type="search"
          className="tsg-search"
          placeholder={locale === 'zh' ? '搜一句 / 一个关键词……' : 'Search a phrase or keyword…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={locale === 'zh' ? '搜索说明书' : 'Search the guide'}
          data-help-search
        />
        <span className="tsg-hitCount" aria-live="polite" data-help-hit-count>
          {hits.length} / {copy.sections.length}
        </span>
      </div>
      <div className="tsg-body">
        <nav className="tsg-toc" aria-label={locale === 'zh' ? '目录' : 'TOC'} data-help-toc>
          {copy.sections.map((section) => {
            const id = section.heading.slice(2).replace(/\s+/g, '-');
            return (
              <a key={section.heading} href={`#${id}`} className="tsg-tocLink">
                {section.heading}
              </a>
            );
          })}
        </nav>
        <div className="tsg-content" data-help-content>
          {hits.length === 0 ? (
            <p className="tsg-empty" data-help-empty>{locale === 'zh' ? '没找到——换个关键词再试。' : 'Nothing found — try another keyword.'}</p>
          ) : (
            hits.map((section) => (
              <section key={section.heading} id={section.heading.slice(2).replace(/\s+/g, '-')} className="tsg-section" data-guide-section={section.heading.slice(2)}>
                <h3 className="tsg-sectionHeading">{section.heading}</h3>
                {section.body.map((para, i) => (
                  <p key={i} className="tsg-para">{para}</p>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
      <footer className="tsg-foot">
        <span>{locale === 'zh' ? '本文档就是用户打开后的第一眼。它不是帮助，是门。' : 'This is the first thing a user should see. Not a help page — a room.'}</span>
      </footer>
    </aside>
  );
}
