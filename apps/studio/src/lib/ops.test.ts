import { describe, expect, it } from 'vitest';
import type { AccountId } from './community';
import type { Assurance } from './assurance';

import type { AuditEntry, Report } from './ops';
import {
  ANONYMOUS_ACTOR,
  auditEntriesByActor,
  auditEntriesForTarget,
  auditEntriesSince,
  auditEntryLabel,
  isAuditEntryOwnedBy,
  isReportClosed,
  reportOpenCount,
  reportResolvedCount,
  reportStatsText,
  reportStatusText,
  auditEntriesByAction,
  REPORT_REASONS,
  reportsByReason,
  REPORT_STATUSES,
  reportsByStatus,
} from './ops';
const entry: AuditEntry = {
  id: 'audit-1',
  action: 'publish',
  actorId: 'acct-actor' as AccountId,
  targetId: 'pub-1',
  targetType: 'publication',
  createdAt: 1_700_000_000_000,
  assurance: 'unsigned-local',
};

const report: Report = {
  id: 'report-1',
  reporterId: 'acct-reporter' as AccountId,
  targetId: 'pub-1',
  reason: 'spam',
  detail: 'please look',
  status: 'open',
  createdAt: 1_700_000_000_000,
};

describe('ops — reportStatusText', () => {
  it('maps each status to a label', () => {
    expect(reportStatusText('open')).toBe('Open');
    expect(reportStatusText('reviewed')).toBe('Reviewed');
    expect(reportStatusText('resolved')).toBe('Resolved');
    expect(reportStatusText('rejected')).toBe('Rejected');
  });

  // v541 — the service's `ReportDtos` has five statuses, not four. `acknowledged` was the one this client
  // had never heard of, and a status with no word rendered as the literal string "Unknown" — an empty
  // label is not the same as an honest "I do not know this one".
  it('has a word for the status the service sends and this build forgot', () => {
    expect(reportStatusText('acknowledged')).toBe('Acknowledged');
  });

  it('names every declared status with something other than "Unknown"', () => {
    // The vocabulary is read off the client's own exported table, so a status added there cannot be
    // skipped here without this case going red.
    for (const status of REPORT_STATUSES) {
      expect(reportStatusText(status)).not.toBe('Unknown');
      expect(reportStatusText(status).length).toBeGreaterThan(0);
    }
  });

  it('passes an undeclared status through instead of inventing a verdict', () => {
    const fromANewerService = 'quarantined-by-a-service-this-build-does-not-have';
    expect(reportStatusText(fromANewerService)).toBe(fromANewerService);
  });
});

describe('ops — isReportClosed', () => {
  it('false for open/reviewed', () => {
    expect(isReportClosed({ ...report, status: 'open' })).toBe(false);
    expect(isReportClosed({ ...report, status: 'reviewed' })).toBe(false);
  });

  it('true for resolved/rejected', () => {
    expect(isReportClosed({ ...report, status: 'resolved' })).toBe(true);
    expect(isReportClosed({ ...report, status: 'rejected' })).toBe(true);
  });

  // v541 — the service describes `acknowledged` as a SMALLER claim than a resolution ("an operator has
  // read this"), so the client must not render it as finished. This is the assertion that keeps the two
  // count helpers from being "tidied" into a partition by folding it into resolved.
  it('false for acknowledged: reading a report is not resolving it', () => {
    expect(isReportClosed({ ...report, status: 'acknowledged' })).toBe(false);
  });
});

describe('ops — AuditEntry shape', () => {
  it('carries the fields a client can read', () => {
    expect(entry.id).toBe('audit-1');
    expect(entry.action).toBe('publish');
    expect(entry.actorId).toBe('acct-actor');
    expect(entry.targetId).toBe('pub-1');
    // v384 — the kind of thing the entry happened to. The service always sends it (it refuses an entry
    // that does not name a kind), so the client model carries it as a required field.
    expect(entry.targetType).toBe('publication');
    expect(entry.createdAt).toBe(1_700_000_000_000);
    expect(entry.assurance).toBe('unsigned-local');
  });
});

describe('ops — auditEntriesForTarget', () => {
  const entries: AuditEntry[] = [
    { ...entry, id: 'a-1', targetId: 'pub-1', createdAt: 1_700_000_000_000 },
    { ...entry, id: 'a-2', targetId: 'pub-2', createdAt: 1_700_001_000_000 },
    { ...entry, id: 'a-3', targetId: 'pub-1', createdAt: 1_700_002_000_000 },
  ];

  it('filters by targetId and sorts newest first, without mutating input', () => {
    const result = auditEntriesForTarget(entries, 'pub-1');
    expect(result.map((e) => e.id)).toEqual(['a-3', 'a-1']);
    expect(entries.length).toBe(3);
  });

  it('empty when no match', () => {
    expect(auditEntriesForTarget(entries, 'pub-999')).toEqual([]);
  });
});

describe('ops — auditEntriesSince', () => {
  const entries: AuditEntry[] = [
    { ...entry, id: 'b-1', createdAt: 1_700_000_000_000 },
    { ...entry, id: 'b-2', createdAt: 1_700_001_000_000 },
    { ...entry, id: 'b-3', createdAt: 1_700_002_000_000 },
  ];

  it('filters by since and sorts newest first', () => {
    const result = auditEntriesSince(entries, 1_700_001_000_000);
    expect(result.map((e) => e.id)).toEqual(['b-3', 'b-2']);
  });

  it('all when since is 0', () => {
    const result = auditEntriesSince(entries, 0);
    expect(result.map((e) => e.id)).toEqual(['b-3', 'b-2', 'b-1']);
  });
});

describe('ops — reportStatsText', () => {
  it('summarizes statuses in open, reviewed, resolved, rejected order', () => {
    const reports: Report[] = [
      { ...report, id: 'r-1', status: 'open' },
      { ...report, id: 'r-2', status: 'resolved' },
      { ...report, id: 'r-3', status: 'open' },
      { ...report, id: 'r-4', status: 'rejected' },
    ];
    expect(reportStatsText(reports)).toBe('open: 2, resolved: 1, rejected: 1');
  });

  it('No reports for empty list', () => {
    expect(reportStatsText([])).toBe('No reports');
  });

  // v541 — the pre-fix body counted a fixed four-key object, so a row whose status was not one of those
  // four contributed NOTHING to the summary: a list of three reports could be described as two, and the
  // dropped row left no trace in the text. The summary is the one ops surface that promises to cover
  // everything, so it now counts every row it is handed.
  it('counts the status this client used to drop', () => {
    expect(reportStatsText([{ ...report, status: 'acknowledged' }])).toBe('acknowledged: 1');
  });

  it('never loses a row: the digits of the summary sum to the length of the list', () => {
    const reports: Report[] = REPORT_STATUSES.map((status, i) => ({ ...report, id: `r-${i}`, status }));
    reports.push({ ...report, id: 'r-future', status: 'quarantined-by-a-service-this-build-does-not-have' });
    const words = reportStatsText(reports);
    const total = [...words.matchAll(/: (\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    expect(total).toBe(reports.length);
    expect(words).not.toContain('NaN');
    expect(words).toContain('acknowledged: 1');
  });

  it('keeps the declared order of the table rather than the order the rows arrived in', () => {
    const reports: Report[] = [
      { ...report, id: 'r-1', status: 'rejected' },
      { ...report, id: 'r-2', status: 'open' },
    ];
    expect(reportStatsText(reports)).toBe('open: 1, rejected: 1');
  });
});

describe('ops — reportOpenCount / reportResolvedCount', () => {
  const reports: Report[] = [
    { ...report, id: 'r-1', status: 'open' },
    { ...report, id: 'r-2', status: 'reviewed' },
    { ...report, id: 'r-3', status: 'resolved' },
    { ...report, id: 'r-4', status: 'rejected' },
  ];

  it('counts open + reviewed as open', () => {
    expect(reportOpenCount(reports)).toBe(2);
    expect(reportResolvedCount(reports)).toBe(2);
  });

  it('zero for empty list', () => {
    expect(reportOpenCount([])).toBe(0);
    expect(reportResolvedCount([])).toBe(0);
  });

  // v541 — these two are deliberately NOT a partition of the five statuses. `acknowledged` belongs to
  // neither bucket, because putting it in "resolved" would claim a disposition the service explicitly
  // calls smaller than one, and putting it in "open" would re-queue a report someone has already read.
  // Full coverage is reportStatsText's job; these two answer two narrower questions.
  it('leaves acknowledged out of BOTH buckets on purpose', () => {
    const acknowledged = [{ ...report, status: 'acknowledged' }];
    expect(reportOpenCount(acknowledged)).toBe(0);
    expect(reportResolvedCount(acknowledged)).toBe(0);
  });
});

describe('ops — auditEntryLabel', () => {
  it('maps each action to a label', () => {
    expect(auditEntryLabel('publish')).toBe('发布');
    expect(auditEntryLabel('unpublish')).toBe('下架');
    expect(auditEntryLabel('remix')).toBe('混改');
    expect(auditEntryLabel('follow')).toBe('关注');
    expect(auditEntryLabel('like')).toBe('点赞');
    expect(auditEntryLabel('comment')).toBe('评论');
    expect(auditEntryLabel('tip')).toBe('打赏');
  });

  // v541 — the service records nine verbs (`AuditService.ACTIONS`), and this table had words for two of
  // the five extra ones only by accident: `unlike`, `uncomment`, `report`, `withdraw-report` and
  // `acknowledge` all rendered as their raw wire tokens, so an ops list showed "unlike" where it meant
  // to show a Chinese verb. These five rows are the ones the pre-fix table could not answer.
  it('has a word for every verb the service actually records', () => {
    expect(auditEntryLabel('unlike')).toBe('取消点赞');
    expect(auditEntryLabel('uncomment')).toBe('取消评论');
    expect(auditEntryLabel('report')).toBe('举报');
    expect(auditEntryLabel('withdraw-report')).toBe('撤销举报');
    expect(auditEntryLabel('acknowledge')).toBe('确认已阅');
  });

  it('returns a word, not the raw token, for every verb it claims to know', () => {
    for (const action of [
      'publish',
      'unpublish',
      'like',
      'unlike',
      'comment',
      'uncomment',
      'report',
      'withdraw-report',
      'acknowledge',
    ]) {
      expect(auditEntryLabel(action)).not.toBe(action);
    }
  });
});

describe('ops — isAuditEntryOwnedBy', () => {
  const entry: AuditEntry = {
    id: 'e-1',
    actorId: 'user-1',
    action: 'publish',
    targetId: 'art-1',
    targetType: 'publication',
    createdAt: 1700000000000,
    assurance: 'unsigned-local',
  };

  it('true when actor matches, false when null or mismatch', () => {
    expect(isAuditEntryOwnedBy(entry, 'user-1')).toBe(true);
    expect(isAuditEntryOwnedBy(entry, 'user-2')).toBe(false);
    expect(isAuditEntryOwnedBy(entry, null)).toBe(false);
  });
});

describe('ops — auditEntriesByActor', () => {
  const entries: AuditEntry[] = [
    { ...entry, id: 'e-1', actorId: 'u-1', action: 'publish' },
    { ...entry, id: 'e-2', actorId: 'u-2', action: 'like' },
    { ...entry, id: 'e-3', actorId: 'u-1', action: 'comment' },
  ];

  it('groups entries by actorId without mutating input', () => {
    const byActor = auditEntriesByActor(entries);
    expect((byActor['u-1'] ?? []).map((e) => e.id)).toEqual(['e-1', 'e-3']);
    expect((byActor['u-2'] ?? []).map((e) => e.id)).toEqual(['e-2']);
    expect(byActor['u-3']).toBeUndefined();
    expect(entries.length).toBe(3);
  });

  it('empty for empty list', () => {
    expect(auditEntriesByActor([])).toEqual({});
  });
});

describe('ops — auditEntriesByAction', () => {
  const entry: AuditEntry = {
    id: 'e-1',
    actorId: 'u-1',
    action: 'publish',
    targetId: 'art-1',
    targetType: 'publication',
    createdAt: 100,
    assurance: 'unsigned-local',
  };
  const entries: AuditEntry[] = [
    { ...entry, id: 'e-1', action: 'publish', createdAt: 100 },
    { ...entry, id: 'e-2', action: 'like', createdAt: 200 },
    { ...entry, id: 'e-3', action: 'publish', createdAt: 300 },
  ];

  it('filters by action and sorts desc by createdAt', () => {
    const out = auditEntriesByAction(entries, 'publish');
    expect(out.map((e) => e.id)).toEqual(['e-3', 'e-1']);
    expect(entries.length).toBe(3);
  });

  it('empty for no match', () => {
    expect(auditEntriesByAction(entries, 'tip')).toEqual([]);
  });
});

describe('ops — reportsByReason', () => {
  const report: Report = {
    id: 'r-1',
    reporterId: 'u-1',
    targetId: 'art-1',
    reason: 'spam',
    detail: 'd',
    status: 'open',
    createdAt: 1700000000000,
  };
  const reports: Report[] = [
    { ...report, id: 'r-1', reason: 'spam' },
    { ...report, id: 'r-2', reason: 'harassment' },
    { ...report, id: 'r-3', reason: 'spam' },
  ];

  it('groups reports by reason without mutating input', () => {
    const byReason = reportsByReason(reports);
    expect((byReason.spam ?? []).map((r) => r.id)).toEqual(['r-1', 'r-3']);
    expect((byReason.harassment ?? []).map((r) => r.id)).toEqual(['r-2']);
    expect((byReason.illegal ?? []).length).toBe(0);
    expect(reports.length).toBe(3);
  });

  // v541 — the pre-fix body pre-seeded exactly the reasons its own union happened to name and then did
  // `out[r.reason].push(...)`. A reason outside that list was not a missing label; it was a crash, and
  // `ReportReason`'s unknown-string arm let the wire carry one into this function without a compile error.
  it('holds every reason the service declares', () => {
    const byReason = reportsByReason([]);
    expect(Object.keys(byReason).sort()).toEqual([...REPORT_REASONS].sort());
  });

  it('gives a reason the service has not declared yet its own bucket instead of throwing', () => {
    const future = 'copyright-when-the-law-that-needs-it-does-not-exist';
    const byReason = reportsByReason([{ ...report, id: 'r-9', reason: future }]);
    expect((byReason[future] ?? []).map((r) => r.id)).toEqual(['r-9']);
    expect(reportsByReason([])[future]).toBeUndefined();
  });
});

describe('ops — reportsByStatus', () => {
  const report: Report = {
    id: 'r-1',
    reporterId: 'u-1',
    targetId: 'art-1',
    reason: 'spam',
    detail: 'd',
    status: 'open',
    createdAt: 1_700_000_000_000,
  };
  const reports: Report[] = [
    { ...report, id: 'r-1', status: 'open' },
    { ...report, id: 'r-2', status: 'reviewed' },
    { ...report, id: 'r-3', status: 'open' },
    { ...report, id: 'r-4', status: 'resolved' },
    { ...report, id: 'r-5', status: 'rejected' },
  ];

  it('buckets every report by status without mutating input', () => {
    const byStatus = reportsByStatus(reports);
    expect((byStatus.open ?? []).map((r) => r.id)).toEqual(['r-1', 'r-3']);
    expect((byStatus.reviewed ?? []).map((r) => r.id)).toEqual(['r-2']);
    expect((byStatus.resolved ?? []).map((r) => r.id)).toEqual(['r-4']);
    expect((byStatus.rejected ?? []).map((r) => r.id)).toEqual(['r-5']);
    expect(reports.length).toBe(5);
  });

  // v541 — the census this case pins grew from four keys to five, and the fifth is the one the service
  // has been sending all along. The keys come from the client's own exported table, so adding a status
  // there without seeding its bucket here is caught by the next case, not by this one.
  it('every status key exists even for an empty list', () => {
    const byStatus = reportsByStatus([]);
    expect(Object.keys(byStatus).sort()).toEqual([...REPORT_STATUSES].sort());
    expect(byStatus.open).toEqual([]);
    expect(byStatus.acknowledged).toEqual([]);
  });

  it('does not throw on a status the service declares and this build has not read', () => {
    const acknowledged = reportsByStatus([{ ...report, id: 'r-6', status: 'acknowledged' }]);
    expect((acknowledged.acknowledged ?? []).map((r) => r.id)).toEqual(['r-6']);
  });

  it('gives an undeclared status its own bucket instead of dropping it or throwing', () => {
    const future = 'quarantined-by-a-service-this-build-does-not-have';
    expect((REPORT_STATUSES as readonly string[]).includes(future)).toBe(false);
    const byStatus = reportsByStatus([{ ...report, id: 'r-7', status: future }]);
    expect((byStatus[future] ?? []).map((r) => r.id)).toEqual(['r-7']);
    for (const status of REPORT_STATUSES) expect(byStatus[status]).toEqual([]);
  });
});

describe('ops — isAuditEntryOwnedBy', () => {
  const entry: AuditEntry = {
    id: 'e-1',
    action: 'follow',
    actorId: 'acct-a',
    targetId: 'art-1',
    targetType: 'publication',
    createdAt: 1_700_000_000_000,
    assurance: 'unsigned-local' as Assurance,
  };

  it('returns false when the actor is null', () => {
    expect(isAuditEntryOwnedBy(entry, null)).toBe(false);
  });

  it('reports true only for the entry owner', () => {
    expect(isAuditEntryOwnedBy(entry, 'acct-a')).toBe(true);
    expect(isAuditEntryOwnedBy(entry, 'acct-b')).toBe(false);
  });
});

/**
 * v273 — 客户端模型与服务端线格式的**逐字段对齐**。
 *
 * v271 的服务端（`AuditController`/`AuditEntry`）如实记录"没有人做"：匿名发布没有 actor，assurance
 * 也就没有随 actor 一起下发。客户端的类型当时写的是非空的 `actorId`/`assurance`——那是客户端的愿望，
 * 不是线格式的事实。这些用例把"服务端会下发的形状"钉住，避免类型再次漂回愿望。
 */
describe('ops — v273 与服务端线格式对齐', () => {
  /** 服务端 `AuditController.Entry` 的 JSON 形状：actorId/assurance 可空，action 是自由字符串。 */
  const wireEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
    id: '1',
    action: 'publish',
    actorId: null,
    targetId: 'pub-1',
    targetType: 'publication',
    createdAt: 1_700_000_000_000,
    assurance: null,
    ...over,
  });

  it('接受一条**匿名**条目：actor 与 assurance 都是 null', () => {
    const anonymous = wireEntry();
    expect(anonymous.actorId).toBeNull();
    expect(anonymous.assurance).toBeNull();
    // 可空类型必须真的能装下 null，而不是靠断言绕过类型系统。
    const widened: AuditEntry = anonymous;
    expect(widened.actorId).toBeNull();
  });

  it('接受一个**具名**条目，并保留 assurance 的原值', () => {
    const named = wireEntry({
      actorId: 'acct-1' as AccountId,
      assurance: 'unsigned-local' as Assurance,
    });
    expect(named.actorId).toBe('acct-1');
    expect(named.assurance).toBe('unsigned-local');
  });

  it('接受一个服务端**还不认识**的动词，而不是把它丢掉', () => {
    const future = wireEntry({ action: 'stake' });
    expect(future.action).toBe('stake');
    // 未知动词仍然可以按动作筛选：它只是没有中文标签，而不是消失。
    expect(auditEntriesByAction([future], 'stake').map((e) => e.id)).toEqual(['1']);
    expect(auditEntryLabel('stake')).toBe('stake');
  });

  it('匿名条目**不属于任何账号**', () => {
    const anonymous = wireEntry();
    expect(isAuditEntryOwnedBy(anonymous, 'acct-1' as AccountId)).toBe(false);
    expect(isAuditEntryOwnedBy(anonymous, null)).toBe(false);
  });

  it('具名条目只属于它自己的账号', () => {
    const named = wireEntry({ actorId: 'acct-1' as AccountId, assurance: 'unsigned-local' as Assurance });
    expect(isAuditEntryOwnedBy(named, 'acct-1' as AccountId)).toBe(true);
    expect(isAuditEntryOwnedBy(named, 'acct-2' as AccountId)).toBe(false);
  });

  it('匿名条目**单独成桶**，不被算进任何具名账号', () => {
    const entries: AuditEntry[] = [
      wireEntry({ id: 'e-1', actorId: 'acct-1' as AccountId, assurance: 'unsigned-local' as Assurance }),
      wireEntry({ id: 'e-2', actorId: null, assurance: null }),
      wireEntry({ id: 'e-3', actorId: null, assurance: null }),
    ];
    const byActor = auditEntriesByActor(entries);
    expect((byActor['acct-1'] ?? []).map((e) => e.id)).toEqual(['e-1']);
    expect((byActor[ANONYMOUS_ACTOR] ?? []).map((e) => e.id)).toEqual(['e-2', 'e-3']);
    // 关键：匿名的两条**没有**被塞进具名账号的桶里。
    expect(byActor['acct-1'] ?? []).toHaveLength(1);
  });

  it('匿名桶键是一个**保留键**，不可能撞上真实账号 id', () => {
    // 真实账号 id 由 `createAccountId` 生成，形如 `acct-<base36>`，永远不以 `__` 开头。
    expect(ANONYMOUS_ACTOR.startsWith('__')).toBe(true);
    expect(ANONYMOUS_ACTOR.startsWith('acct-')).toBe(false);
  });

  it('空列表仍然得到空的分桶', () => {
    expect(auditEntriesByActor([])).toEqual({});
  });
});
