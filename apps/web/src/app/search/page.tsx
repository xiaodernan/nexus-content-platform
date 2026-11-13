import { searchPlatform, SEARCH_NOT_COVERED, SEARCH_ORDER_METHOD, normalizeQuery } from '@/server/domain/search';
import { currentUserOrNull } from '@/server/domain/session';
import { SearchBox } from './SearchBox';
import { BrandTitle } from '@/components/BrandTitle';

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
        <BrandTitle className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">
          全平台搜索
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </BrandTitle>
        <span className="rounded-full border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2.5 py-0.5 font-mono text-11 text-fg-3">
          {result.signedIn ? '九类目标 · 内容组只覆盖你自己的项目' : '未登录：只搜公开项目与公开主页'}
        </span>
      </header>

      {/* §165：建议来自真实命中（同一份可见性判定），历史只存在这台设备上。
          没有 JS 时仍是原生 GET 表单——建议与历史是增强，不是唯一入口。 */}
      <SearchBox initialQuery={q} />
      <p className="-mt-3 text-11 text-fg-3" data-search-suggest-note>
        键入两个字符起给出建议——建议就是真实命中，点开即到；最近搜索只存在这台设备上，可逐条删或清空。
      </p>

      {result.tooShort ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-6" data-search-too-short>
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">SEARCH</span>
          <h2 className="text-15 font-semibold text-fg-1">至少输入两个字符</h2>
          <p className="max-w-md text-13 leading-6 text-fg-2">一个汉字会命中半个平台，那样的结果列表没有意义。</p>
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-6" data-search-empty>
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">SEARCH</span>
          <h2 className="text-15 font-semibold text-fg-1">没有匹配「{q}」的内容</h2>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            {result.signedIn
              ? '内容那六组只搜你自己的项目——别人的世界、角色与资产没有发布链路，列出来也打不开。'
              : '登录后还会搜你自己的世界、游戏、角色、设计稿、组件与资产。'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6" data-search-results>
          <p className="text-12 text-fg-3" data-search-method>
            {SEARCH_ORDER_METHOD}
          </p>
          {result.groups.map((group) =>
            group.hits.length ? (
              <section key={group.key} data-search-group={group.key}>
                <h2 className="mb-2 font-mono text-11 uppercase tracking-[0.2em] text-[var(--nexus-color-accent-2-ink)]">
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
                        className="group flex items-baseline justify-between gap-3 rounded-xl border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--nexus-color-brand)] hover:shadow-[0_12px_32px_rgb(91_108_255/0.18)]"
                        data-search-hit={hit.id}
                      >
                        <span className="text-14 text-fg-1" data-search-hit-title>
                          {hit.title}
                        </span>
                        {hit.detail ? (
                          <span className="truncate text-12 text-fg-3 transition-colors group-hover:text-fg-2">
                            {hit.detail}
                          </span>
                        ) : null}
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
        <h2 className="mb-2 font-mono text-11 uppercase tracking-[0.2em] text-[var(--nexus-color-accent-2-ink)]">这份搜索没覆盖什么</h2>
        <ul className="grid gap-1 text-12 leading-relaxed text-fg-3">
          {SEARCH_NOT_COVERED.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
