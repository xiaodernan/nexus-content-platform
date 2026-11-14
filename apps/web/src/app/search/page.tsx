import { searchPlatform, SEARCH_NOT_COVERED, SEARCH_ORDER_METHOD, normalizeQuery } from '@/server/domain/search';
import { currentUserOrNull } from '@/server/domain/session';
import { SearchBox } from './SearchBox';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * §165 全平台搜索。一个 GET 表单 + 服务端渲染的结果，没有"边打字边发请求"的
 * 假实时：那需要一个搜索 API 与防抖，而这里要的只是"打得准就能找到"。
 *
 * 页面把**搜了哪九类、没搜什么**都写在脸上。范围与可见性由 `domain/search.ts` 决定，
 * 界面上不另立一套说法。双语驱动：
 */

type Loc = 'zh' | 'en';

const COPY = {
  zh: {
    title: '全平台搜索',
    scopeLineSignedIn: '九类目标 · 内容组只覆盖你自己的项目',
    scopeLineAnonymous: '未登录：只搜公开项目与公开主页',
    suggestNote: '键入两个字符起给出建议——建议就是真实命中，点开即到；最近搜索只存在这台设备上，可逐条删或清空。',
    tooShort: '至少输入两个字符。一个汉字会命中半个平台，那样的结果列表没有意义。',
    empty: '没有匹配「{q}」的内容。',
    emptySuffixSignedIn: '内容那六组只搜你自己的项目——别人的世界、角色与资产没有发布链路，列出来也打不开。',
    emptySuffixAnonymous: '登录后还会搜你自己的世界、游戏、角色、设计稿、组件与资产。',
    scopeTitle: '这份搜索没覆盖什么',
    localeToggleHint: 'Switch to English',
    cappedHint: '还有更多（每组最多 {n} 条）',
  },
  en: {
    title: 'Search the platform',
    scopeLineSignedIn: 'Nine categories · content group covers only your own projects',
    scopeLineAnonymous: 'Not signed in: searching only public projects and public author pages',
    suggestNote: 'Two or more characters give suggestions — every suggestion is a real hit, click to open it; recent searches stay on this device, clear anytime.',
    tooShort: 'Enter at least two characters. A single character would match half the platform; that result list would be useless.',
    empty: 'No matches for “{q}”.',
    emptySuffixSignedIn: 'Content-ish groups search only your own projects — others’ worlds / characters / assets have no publish link, so they’re not listed.',
    emptySuffixAnonymous: 'After signing in this also searches your own worlds, games, characters, designs, components and assets.',
    scopeTitle: 'What this search does NOT cover',
    localeToggleHint: '切换到中文',
    cappedHint: 'More available (each group capped at {n})',
  },
} as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const query = await searchParams;
  const q = normalizeQuery(query.q);
  const viewer = await currentUserOrNull();
  const result = await searchPlatform(q, viewer?.id ?? null);
  const total = result.groups.reduce((n, g) => n + g.hits.length, 0);
  const locale = (await getLocale()) as Loc;
  const copy = COPY[locale];

  return (
    <main className="se-pageRoot" data-search-root data-search-locale={locale}>
      <header className="se-header">
        <h1 className="se-title">{copy.title}</h1>
        <span className="se-scopeLine">{result.signedIn ? copy.scopeLineSignedIn : copy.scopeLineAnonymous}</span>
      </header>

      {/* §165：建议来自真实命中（同一份可见性判定），历史只存在这台设备上。
          没有 JS 时仍是原生 GET 表单——建议与历史是增强，不是唯一入口。 */}
      <SearchBox initialQuery={q} />
      <p className="se-suggestNote" data-search-suggest-note>
        {copy.suggestNote}
      </p>

      {result.tooShort ? (
        <p className="se-empty" data-search-too-short>
          {copy.tooShort}
        </p>
      ) : total === 0 ? (
        <p className="se-empty" data-search-empty>
          {copy.empty.replace('{q}', q)}
          {result.signedIn ? copy.emptySuffixSignedIn : copy.emptySuffixAnonymous}
        </p>
      ) : (
        <div className="se-results" data-search-results>
          <p className="se-method" data-search-method>
            {SEARCH_ORDER_METHOD}
          </p>
          {result.groups.map((group) =>
            group.hits.length ? (
              <section key={group.key} data-search-group={group.key}>
                <h2 className="se-groupHead">
                  <span className="se-groupLabel">{group.label}</span>
                  <span className="se-groupCount">{group.hits.length}</span>
                  {group.capped ? (
                    <span className="se-groupCapped" data-search-capped>
                      {copy.cappedHint.replace('{n}', String(result.perGroup))}
                    </span>
                  ) : null}
                </h2>
                <ul className="se-hitGrid">
                  {group.hits.map((hit) => (
                    <li key={hit.id}>
                      <a href={hit.href} className="se-hit" data-search-hit={hit.id}>
                        <span className="se-hitTitle" data-search-hit-title>
                          {hit.title}
                        </span>
                        {hit.detail ? <span className="se-hitDetail">{hit.detail}</span> : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}

      <section className="se-scope" data-search-scope>
        <h2 className="se-scopeTitle">{copy.scopeTitle}</h2>
        <ul className="se-scopeList">
          {SEARCH_NOT_COVERED.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
