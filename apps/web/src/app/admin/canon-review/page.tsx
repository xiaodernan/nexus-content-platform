import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { CanonReviewPanel } from './CanonReviewPanel';
import { getLocale, type Locale } from '@/lib/i18n';
import { BIBLE_ANCHORS } from '@/world-bible/anchors.generated';
import { BIBLE_ECHOES, BIBLE_CHAPTERS } from '@/world-bible/generated';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  scopeNote: (anchors: number, echoes: number, chapters: number) => string;
  panelTitle: string;
  ariaLabel: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：正典评审只对 role=admin 可见。`,
    title: '正典评审 · 用真模型过一遍同一把尺子',
    scopeNote: (anchors, echoes, chapters) =>
      `把一篇候选回响（或章节）交给 gpt-6.2-sol，对照 ${chapters} 章正典的紧凑索引与 ${anchors} 条既有锚句，逐条回答：疑似新专名、与设定冲突的陈述、锚句撞句风险、能不能进正典。只读——模型只评审，不改写候选、不写正典、不落库。当前正典：${chapters} 章 + ${echoes} 回响。`,
    panelTitle: '贴一篇候选 · 看它能不能进正典',
    ariaLabel: '正典评审面板',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): canon review is visible only to role=admin.`,
    title: 'Canon review · the same ruler, run by the real model',
    scopeNote: (anchors, echoes, chapters) =>
      `Hand one candidate echo (or chapter) to gpt-6.2-sol with the compact index of ${chapters} canonical chapters and ${anchors} existing anchors, and it answers point by point: suspected new proper nouns, statements that contradict the setting, anchor collisions, and whether this can enter the canon as it stands. Read-only — the model reviews, it never rewrites the candidate, never writes the canon, never persists. Current canon: ${chapters} chapters + ${echoes} echoes.`,
    panelTitle: 'Paste a candidate · see whether it can enter the canon',
    ariaLabel: 'Canon review panel',
  },
};

export default async function AdminCanonReviewPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedNotAdmin(user.displayName, user.role)}</p>
      </main>
    );
  }

  return (
    <main className="am-shellGapXl" data-canon-review-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="am-titleLg">{c.title}</h1>
          <p className="adm-capNote" data-canon-review-scope>
            {c.scopeNote(BIBLE_ANCHORS.length, BIBLE_ECHOES.length, BIBLE_CHAPTERS.length)}
          </p>
        </div>
        <AdminNav current="canon-review" />
      </header>

      <CanonReviewPanel locale={locale} panelTitle={c.panelTitle} ariaLabel={c.ariaLabel} />
    </main>
  );
}
