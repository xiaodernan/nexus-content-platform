import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideReadingProgress } from '@/components/GuideReadingProgress';
import { getLocale } from '@/lib/i18n';
import { GUIDE_COPY } from '@/lib/guideCopy';
import { searchGuideSections } from '@/lib/guideSearch';
import { isUuid } from '@/server/domain/ids';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '使用指南 — NEXUS',
        description: 'NEXUS 平台的中英双语说明书：真实操作、功能路径、游戏玩法与常见问答。',
      }
    : {
        title: 'User guide — NEXUS',
        description: 'The bilingual NEXUS handbook: real operations, feature routes, the games, and the questions people actually ask.',
      };
}

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; project?: string | string[] }>;
}) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const copy = GUIDE_COPY[locale];
  const query = firstParam(params.q).trim();
  const projectParam = firstParam(params.project).trim();
  const projectId = isUuid(projectParam) ? projectParam : null;
  const hits = searchGuideSections(copy.sections, query);
  const anchors = copy.sections.map((section) => section.anchor);
  const text = {
    zh: {
      search: '在本指南中查找',
      placeholder: '例如：发布、撤销、StateGraph、/tidewatch',
      submit: '查找',
      clear: '查看全部',
      summary: query ? `找到 ${hits.length} / ${copy.sections.length} 节` : `共 ${copy.sections.length} 节`,
      empty: '没有匹配的章节。可以换一个更短的关键词，或清空搜索查看全部。',
      invalidProject: '项目上下文不是有效 UUID，已忽略。',
      project: '返回当前项目',
      local: '检索在本机服务器上进行，只匹配标题与正文，不调用模型。',
    },
    en: {
      search: 'Search this guide',
      placeholder: 'For example: publish, undo, StateGraph, /tidewatch',
      submit: 'Search',
      clear: 'Show all',
      summary: query ? `${hits.length} of ${copy.sections.length} sections found` : `${copy.sections.length} sections`,
      empty: 'No matching sections. Try a shorter keyword or clear the search to see everything.',
      invalidProject: 'The project context was not a valid UUID and has been ignored.',
      project: 'Return to current project',
      local: 'Search runs on the local server against headings and body text only; it does not call a model.',
    },
  }[locale];

  return (
    <main className="gd-root" data-guide-root data-guide-locale={locale}>
      <header className="gd-hero">
        <p className="gd-kicker">{copy.kicker}</p>
        <h1 className="gd-title">{copy.title}</h1>
        <p className="gd-lede">{copy.lede}</p>
        {projectId ? (
          <Link className="gd-projectLink" href={`/studio/${projectId}`} data-guide-project-link>
            ← {text.project}
          </Link>
        ) : null}
        {projectParam && !projectId ? <p className="gd-projectWarning" data-guide-project-warning>{text.invalidProject}</p> : null}
      </header>

      <section className="gd-tools" aria-label={text.search} data-guide-search-panel>
        <form className="gd-searchForm" action="/guide" method="get" role="search" data-guide-search-form>
          <label className="gd-searchLabel" htmlFor="guide-search">{text.search}</label>
          <div className="gd-searchRow">
            <input
              id="guide-search"
              className="gd-searchInput"
              type="search"
              name="q"
              defaultValue={query}
              placeholder={text.placeholder}
              data-guide-search
            />
            <button type="submit" className="gd-searchSubmit">{text.submit}</button>
            {query ? <Link className="gd-clearSearch" href={projectId ? `/guide?project=${encodeURIComponent(projectId)}` : '/guide'} data-guide-clear-search>{text.clear}</Link> : null}
          </div>
          {projectId ? <input type="hidden" name="project" value={projectId} data-guide-project-input /> : null}
        </form>
        <p className="gd-searchSummary" aria-live="polite" data-guide-hit-count>{text.summary}</p>
        <p className="gd-searchNote">{text.local}</p>
      </section>

      <GuideReadingProgress anchors={anchors} visibleAnchors={hits.map((section) => section.anchor)} locale={locale} />

      {hits.length > 0 ? (
        <nav className="gd-toc" aria-label={locale === 'zh' ? '目录' : 'TOC'} data-guide-toc>
          {hits.map((section) => (
            <a key={section.anchor} href={`#${section.anchor}`} className="gd-tocLink">{section.heading}</a>
          ))}
        </nav>
      ) : null}

      {hits.length === 0 ? (
        <p className="gd-empty" data-guide-empty>{text.empty}</p>
      ) : hits.map((section) => (
        <section key={section.anchor} id={section.anchor} className="gd-section" aria-label={section.heading} data-guide-section={section.anchor}>
          <h2 className="gd-sectionTitle">{section.heading}</h2>
          {section.body.map((para, i) => (
            <p key={i} className="gd-para">{para}</p>
          ))}
        </section>
      ))}

      <footer className="gd-foot">
        <Link className="am-linkImplicit" href="/about-nexus">← {locale === 'zh' ? '关于 NEXUS' : 'About NEXUS'}</Link>
        <Link className="am-linkImplicit" href="/map">{locale === 'zh' ? '世界全图 →' : 'World atlas →'}</Link>
        <Link className="am-linkImplicit" href="/discover">{locale === 'zh' ? '去广场 →' : 'Go to /discover →'}</Link>
      </footer>
    </main>
  );
}
