import { searchPlatform, SEARCH_NOT_COVERED, SEARCH_ORDER_METHOD, normalizeQuery } from '@/server/domain/search';
import { currentUserOrNull } from '@/server/domain/session';

export const dynamic = 'force-dynamic';

/**
 * §165 全平台搜索。一个 GET 表单 + 服务端渲染的结果，没有"边打字边发请求"的
 * 假实时：那需要一个搜索 API 与防抖，而这里要的只是"打得准就能找到"。
 *
 * 页面把**搜了哪九类、没搜什么**都写在脸上。范围与可见性由 `domain/search.ts` 决定，
 * 界面上不另立一套说法。
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const query = await searchParams;
  const q = normalizeQuery(query.q);
  const viewer = await currentUserOrNull();
  const result = await searchPlatform(q, viewer?.id ?? null);
  const total = result.groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-[820px] flex-col gap-6 px-6 py-10" data-search-root>
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">全平台搜索</h1>
        <span className="font-mono text-12 text-fg-3">{result.signedIn ? '九类目标 · 内容组只覆盖你自己的项目' : '未登录：只搜公开项目与公开主页'}</span>
      </header>

      <form action="/search" method="get" className="flex items-center gap-2" data-search-form>
        <input
          name="q"
          defaultValue={q}
          aria-label="搜索内容"
          data-search-input
          placeholder="项目 / 用户 / 世界 / 游戏 / 角色 / 设计稿 / 组件 / 资产"
          className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-3 py-2 text-14 text-fg-1 outline-none focus:bg-bg-2"
        />
        <button type="submit" data-search-submit className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-4 py-2 text-13 text-bg-0">
          搜
        </button>
      </form>

      {result.tooShort ? (
        <p className="text-13 text-fg-2" data-search-too-short>
          至少输入两个字符。一个汉字会命中半个平台，那样的结果列表没有意义。
        </p>
      ) : total === 0 ? (
        <p className="text-13 text-fg-2" data-search-empty>
          没有匹配「{q}」的内容。
          {result.signedIn
            ? '内容那六组只搜你自己的项目——别人的世界、角色与资产没有发布链路，列出来也打不开。'
            : '登录后还会搜你自己的世界、游戏、角色、设计稿、组件与资产。'}
        </p>
      ) : (
        <div className="flex flex-col gap-6" data-search-results>
          <p className="text-12 text-fg-3" data-search-method>
            {SEARCH_ORDER_METHOD}
          </p>
          {result.groups.map((group) =>
            group.hits.length ? (
              <section key={group.key} data-search-group={group.key}>
                <h2 className="mb-2 text-14 font-medium">
                  {group.label}
                  {group.capped ? (
                    <span className="ml-2 font-mono text-12 text-fg-3" data-search-capped>
                      还有更多（每组最多 {result.perGroup} 条）
                    </span>
                  ) : null}
                </h2>
                <ul className="grid gap-2">
                  {group.hits.map((hit) => (
                    <li key={hit.id}>
                      <a
                        href={hit.href}
                        className="flex items-baseline justify-between gap-3 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-4 py-3 hover:bg-bg-2"
                        data-search-hit={hit.id}
                      >
                        <span className="text-14" data-search-hit-title>
                          {hit.title}
                        </span>
                        {hit.detail ? <span className="truncate text-12 text-fg-3">{hit.detail}</span> : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}

      <section className="border-t border-[var(--nexus-color-border-subtle)] pt-4" data-search-scope>
        <h2 className="mb-2 text-14 font-medium">这份搜索没覆盖什么</h2>
        <ul className="grid gap-1 text-12 leading-relaxed text-fg-3">
          {SEARCH_NOT_COVERED.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
