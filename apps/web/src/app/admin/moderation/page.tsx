import Link from 'next/link';
import { listReviewQueue, MODERATION_LIMITS, MODERATION_LIMITS_EN, MODERATION_RULES_VERSION } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { ResolveButtons } from './ResolveButtons';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  becomeAdminLink: string;
  becomeAdminTail: string;
  backHome: string;
  title: string;
  summary: (pending: number, version: string) => string;
  limitsLede: string;
  empty: string;
  decisionBlocked: string;
  decisionPending: string;
  otherReports: (n: number) => string;
  publishedVersion: (v: number | string) => string;
  locationQuote: (where: string, quote: string) => string;
  openLink: string;
  nothingPublished: string;
}> = {
  zh: {
    deniedTitle: '人工复核台',
    deniedAnonymous: '需要先登录才能看队列。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：审核队列只对 role=admin 可见。`,
    becomeAdminLink: '账号与角色',
    becomeAdminTail: '由现有审核员提权（不能改自己、guest 不给提权，每次尝试都进审计）。',
    backHome: '回到我的项目',
    title: '人工复核台',
    summary: (pending, version) => `待看 ${pending} 案 · 规则版本 ${version} · 裁决之后这案就离开队列（放行/拒绝都会）`,
    limitsLede: '这一轮机检覆盖不到的部分：',
    empty: '队列里没有待看的案子。这不等于平台内容是干净的：机检只挡得住它写得出规则的那部分。',
    decisionBlocked: '机检挡下了这次发布',
    decisionPending: '机检挂起，页面已发出',
    otherReports: (n) => `另有 ${n} 条举报`,
    publishedVersion: (v) => `第 ${v} 版`,
    locationQuote: (where, quote) => `位置 ${where} · 「${quote}」`,
    openLink: '打开这一版看看',
    nothingPublished: '这次发布没发出去，所以没有页面可看',
  },
  en: {
    deniedTitle: 'Moderation queue',
    deniedAnonymous: 'You must sign in to see the queue.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the review queue is visible only to role=admin.`,
    becomeAdminLink: 'Accounts & roles',
    becomeAdminTail: ' — promoted by an existing admin (no self, no unclaimed guests; every attempt is audited).',
    backHome: 'Back to my projects',
    title: 'Moderation queue',
    summary: (pending, version) => `${pending} pending · rules ${version} · either verdict takes this case out of the queue`,
    limitsLede: 'What this round of machine review cannot reach:',
    empty: 'The queue is empty. That does not mean the platform’s content is clean — the machine only blocks what its rules can express.',
    decisionBlocked: 'The machine blocked this publish',
    decisionPending: 'The machine flagged it — page went out',
    otherReports: (n) => `${n} more report${n === 1 ? '' : 's'}`,
    publishedVersion: (v) => `v${v}`,
    locationQuote: (where, quote) => `at ${where} · “${quote}”`,
    openLink: 'Open this version',
    nothingPublished: 'This publish never went out — there is no page to look at',
  },
};

/**
 * §131 的人工复核台。机检只能把可疑的挂上来，下结论必须是这里——
 * 没有这一页，案子就会永远停在 pending，而 `moderation` 那一列又变回一个没人读的死字段。
 *
 * 默认拒绝：没登录说"要登录"，不是 admin 说"只对审核员开放"，两种都不泄露队列里有什么
 * （连案子数都不给）。谁是 admin 由 `/admin/users` 提权（判定在 `domain/roles.ts`，每次尝试进审计）。
 */
export default async function AdminModerationPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="am-shellDenied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="am-shellDenied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
        <p className="am-note">
          <Link href="/admin/users" className="am-linkInline">{c.becomeAdminLink}</Link>
          {c.becomeAdminTail}
        </p>
        <Link href="/" className="am-backlink">
          {c.backHome}
        </Link>
      </main>
    );
  }

  const cases = await listReviewQueue();
  const limits = locale === 'en' ? MODERATION_LIMITS_EN : MODERATION_LIMITS;
  return (
    <main className="am-shellMid" data-admin-queue>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="am-summary" data-rules-version={MODERATION_RULES_VERSION}>
            {c.summary(cases.length, MODERATION_RULES_VERSION)}
          </p>
        </div>
        <AdminNav current="moderation" />
      </header>

      {/* 复核的人必须知道机检没看到什么，否则"队列里只剩这几案"会被读成"其余都是干净的" */}
      <section className="am-scopeBox" data-queue-limits>
        <p className="am-lede">{c.limitsLede}</p>
        <ul className="am-limitsList">
          {limits.map((limit) => (
            <li className="am-note" data-queue-limit key={limit}>
              · {limit}
            </li>
          ))}
        </ul>
      </section>

      {cases.length === 0 ? (
        <p className="am-empty" data-queue-empty>
          {c.empty}
        </p>
      ) : null}

      {cases.map((entry) => (
        <article
          className="am-reportCard"
          data-queue-case={entry.caseId}
          key={entry.caseId}
        >
          <header className="am-reportHead">
            <span className="am-reportReason" data-case-project>
              {entry.projectName}
            </span>
            <span className="am-note">
              {entry.ownerName} · {c.publishedVersion(entry.publicationVersion)} · {entry.visibility} ·{' '}
              {new Date(entry.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}
            </span>
            <span className="am-statusLabel" data-case-decision={entry.decision}>
              {entry.decision === 'blocked' ? c.decisionBlocked : c.decisionPending}
            </span>
            {entry.reportCount > 0 ? (
              <span className="am-dangerNote" data-case-reports={String(entry.reportCount)}>
                {c.otherReports(entry.reportCount)}
              </span>
            ) : null}
          </header>
          <ul className="am-findingsList">
            {entry.findings.map((finding, i) => (
              <li className="am-findingText" data-case-finding={finding.rule} key={`${finding.rule}-${i}`}>
                <span className="am-ruleMono">{finding.rule}</span> · {finding.why}
                <span className="am-findingWhere">
                  {c.locationQuote(finding.where, finding.quote)}
                </span>
              </li>
            ))}
          </ul>
          {entry.path ? (
            <a
              href={entry.path}
              target="_blank"
              rel="noreferrer"
              className="am-linkTargetSub"
              data-case-open
            >
              {c.openLink}
            </a>
          ) : (
            <span className="am-note" data-case-open="none">
              {c.nothingPublished}
            </span>
          )}
          <ResolveButtons caseId={entry.caseId} locale={locale} />
        </article>
      ))}
    </main>
  );
}
