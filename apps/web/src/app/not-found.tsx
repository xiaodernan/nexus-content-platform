import Link from 'next/link';

/**
 * §FE-9 根 404 门面（ADR-0151）：`/app/not-found.tsx`。
 *
 * 覆盖两类落点——所有页面级 notFound 调用（来自 next/navigation），以及一切 unmatched URL。
 * 此前二者都落到 Next.js 内建裸 404，一色字、零品牌、零去处，是全站唯一没有门面的公开页。
 * 根 404 继承 root layout 的 `data-nexus-theme` 双主题与 ThemeToggle，无需自带主题逻辑。
 *
 * 双语方式：**这一页是静态的，读不到 cookie**，所以只能把中英两份都印出来（机场路牌那种双语，
 * 两份都是"原生"，不是夹杂）。`lang` 属性给两组分别标语言，读屏按自己的语言念。
 *
 * **纯展示、零行为**（ADR-0123 六红线 / ADR-0148 完成度口径诚实）：
 *  - 不是 client 组件，无 hook / fetch / server action / 读路径，不碰任何后端数据；
 *  - 只给两类去处（回首页、去发现页），都是静态站内链接；
 *  - 文案说清"这个地址没有内容"，列出可能原因，但**不替访客猜是哪一种**——
 *    链接失效、作品撤下、地址拼错都得查只有作者与服务器知道的记录才能确认（§159）。
 *
 * 视觉（`.nf-` 语义类）与结构（data-not-found-* 钩子）分离：FE-9 只上妆 + 补诚实门面，
 * 不伪造"内容曾存在"的暗示，也不把 404 说成 500 或"正在加载"。
 */
export default function NotFound() {
  return (
    <main className="nf-root" data-not-found>
      <div className="nf-frame" data-not-found-frame>
        <p className="nf-eyebrow" data-not-found-eyebrow>
          NEXUS · 路标指错了 · Wrong turn
        </p>

        <p className="nf-code" data-not-found-code aria-hidden="true">
          404
        </p>

        <h1 className="nf-title" data-not-found-title lang="zh-CN">
          这个地址没有内容
        </h1>
        <p className="nf-titleEn" lang="en">
          There is nothing at this address
        </p>

        <p className="nf-detail" data-not-found-detail lang="zh-CN">
          这不是加载慢，也不是你操作错了。服务器如实回了一句：这里没有可给的东西。
          常见的原因有这么几种——
        </p>
        <p className="nf-detailEn" lang="en">
          This is not a slow load, and it is not a mistake on your part. The server honestly answered one thing:
          there is no content to give here. The common causes are these —
        </p>

        <ul className="nf-reasons" data-not-found-reasons>
          <li className="nf-reason" lang="zh-CN">
            这条链接已经失效，指向的作品或页面不在了；
          </li>
          <li className="nf-reason" lang="zh-CN">
            作品被作者撤下或改成了不公开，旧分享链接就落空了；
          </li>
          <li className="nf-reason" lang="zh-CN">
            地址里有一处拼写或复制时带进来的字符对不上。
          </li>
          <li className="nf-reason" lang="en">
            This link is dead — the work or page it points to is gone;
          </li>
          <li className="nf-reason" lang="en">
            The author took the work down or made it private, and the old share link landed in the void;
          </li>
          <li className="nf-reason" lang="en">
            There is a spelling slip in the address, or a character that slipped in during copy-paste.
          </li>
        </ul>

        <p className="nf-honesty" data-not-found-honesty lang="zh-CN">
          我们不会替你猜是哪一种：它到底有没有存在过、为什么现在取不到，
          得查只有作者和服务器知道的记录才说得准。这里只如实说"这个地址现在没有内容"。
        </p>
        <p className="nf-honesty" lang="en">
          We will not guess which one for you: whether it ever existed, and why it cannot be reached now, can only be
          settled by records the author and the server hold. Here we only honestly say: this address has no content
          right now.
        </p>

        <div className="nf-actions" data-not-found-actions>
          <Link href="/discover" className="nf-discover" data-not-found-discover>
            去发现页看看别人在做啥 <span lang="en">· Discover</span>
          </Link>
          <Link href="/" className="nf-home" data-not-found-home>
            回到首页 <span lang="en">· Home</span>
          </Link>
        </div>

        <p className="nf-foot" data-not-found-foot>
          <span lang="zh-CN">
            如果你是顺着本站里的链接走到这里的，那条链接可能该修了——发现页和首页总能带你回到有内容的地方。
          </span>{' '}
          <span lang="en">
            If you followed a link inside this site to get here, that link is probably due for repair — Discover and
            Home can always get you back to somewhere with content.
          </span>
        </p>
      </div>
    </main>
  );
}
