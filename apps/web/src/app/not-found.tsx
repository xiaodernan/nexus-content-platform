import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';

/**
 * §FE-9 根 404 门面（ADR-0151）：`/app/not-found.tsx`。
 *
 * 覆盖两类落点——所有页面级 notFound 调用（来自 next/navigation，散在 9 个 page.tsx 里
 * 十余处：作品/作者/世界/试玩/分镜/预览/studio/tasks 等），以及一切 unmatched URL。
 * 此前二者都落到 Next.js 内建裸 404，一色字、零品牌、零去处，是全站唯一没有门面的公开页。
 * 根 404 继承 root layout 的 `data-nexus-theme` 双主题与 ThemeToggle，无需自带主题逻辑。
 *
 * **纯展示、零行为**（ADR-0123 六红线 / ADR-0148 完成度口径诚实）：
 *  - 不是 client 组件，无 hook / fetch / server action / 读路径，不碰任何后端数据；
 *  - 只给两类去处（回首页、去发现页），都是静态站内链接；
 *  - 文案说清"这个地址没有内容"，列出可能原因，但**不替访客猜是哪一种**——
 *    链接失效、作品撤下、地址拼错都得查只有作者与服务器知道的记录才能确认（§159）。
 *
 * 双语（2026-11-15）：getLocale() 由 cookie 读语言，COPY 中英一辞两字面，不夹杂。
 */
const COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  detail: string;
  reasons: readonly string[];
  honesty: string;
  discover: string;
  home: string;
  foot: string;
}> = {
  zh: {
    eyebrow: 'NEXUS · 路标指错了',
    title: '这个地址没有内容',
    detail: '这不是加载慢，也不是你操作错了。服务器如实回了一句：这里没有可给的东西。常见的原因有这么几种——',
    reasons: [
      '这条链接已经失效，指向的作品或页面不在了；',
      '作品被作者撤下或改成了不公开，旧分享链接就落空了；',
      '地址里有一处拼写或复制时带进来的字符对不上。',
    ],
    honesty: '我们不会替你猜是哪一种：它到底有没有存在过、为什么现在取不到，得查只有作者和服务器知道的记录才说得准。这里只如实说"这个地址现在没有内容"。',
    discover: '去发现页看看别人在做啥',
    home: '回到首页',
    foot: '如果你是顺着本站里的链接走到这里的，那条链接可能该修了——发现页和首页总能带你回到有内容的地方。',
  },
  en: {
    eyebrow: 'NEXUS · A wrong turn',
    title: 'No content at this address',
    detail: 'This is not a slow load, and not your mistake. The server answered honestly: there is nothing to give at this address. The usual causes are—',
    reasons: [
      'This link is dead — the work or page it pointed at no longer exists;',
      'The work was withdrawn or made private — the old share link lands nowhere;',
      'A character in the address was mistyped or carried in while copying.',
    ],
    honesty: 'We will not guess which one it is: whether this address ever existed, and why it cannot be reached now, are records only the author and the server hold. All this page can honestly say: this address has no content right now.',
    discover: 'See what people are making',
    home: 'Back to the home page',
    foot: 'If you arrived here via a link elsewhere on this site, that link may need repair — the discover page and the home page always lead somewhere with content.',
  },
};

export default async function NotFound() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="nf-root" data-not-found>
      <div className="nf-frame" data-not-found-frame>
        <p className="nf-eyebrow" data-not-found-eyebrow>
          {c.eyebrow}
        </p>

        <p className="nf-code" data-not-found-code aria-hidden="true">
          404
        </p>

        <h1 className="nf-title" data-not-found-title>
          {c.title}
        </h1>

        <p className="nf-detail" data-not-found-detail>
          {c.detail}
        </p>

        <ul className="nf-reasons" data-not-found-reasons>
          {c.reasons.map((reason, i) => (
            <li key={i} className="nf-reason">{reason}</li>
          ))}
        </ul>

        <p className="nf-honesty" data-not-found-honesty>
          {c.honesty}
        </p>

        <div className="nf-actions" data-not-found-actions>
          <Link href="/discover" className="nf-discover" data-not-found-discover>
            {c.discover}
          </Link>
          <Link href="/" className="nf-home" data-not-found-home>
            {c.home}
          </Link>
        </div>

        <p className="nf-foot" data-not-found-foot>
          {c.foot}
        </p>
      </div>
    </main>
  );
}
