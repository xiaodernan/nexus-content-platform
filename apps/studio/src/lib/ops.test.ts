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
  reportsByReason,
  reportsByStatus,
} from './ops';
const entry: AuditEntry = {
  id: 'audit-1',
  action: 'publish',
  actorId: 'acct-actor' as AccountId,
  targetId: 'pub-1',
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
});

describe('ops — AuditEntry shape', () => {
  it('carries the fields a client can read', () => {
    expect(entry.id).toBe('audit-1');
    expect(entry.action).toBe('publish');
    expect(entry.actorId).toBe('acct-actor');
    expect(entry.targetId).toBe('pub-1');
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
});

describe('ops — isAuditEntryOwnedBy', () => {
  const entry: AuditEntry = {
    id: 'e-1',
    actorId: 'user-1',
    action: 'publish',
    targetId: 'art-1',
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
    expect(byStatus.open.map((r) => r.id)).toEqual(['r-1', 'r-3']);
    expect(byStatus.reviewed.map((r) => r.id)).toEqual(['r-2']);
    expect(byStatus.resolved.map((r) => r.id)).toEqual(['r-4']);
    expect(byStatus.rejected.map((r) => r.id)).toEqual(['r-5']);
    expect(reports.length).toBe(5);
  });

  it('every status key exists even for an empty list', () => {
    const byStatus = reportsByStatus([]);
    expect(Object.keys(byStatus).sort()).toEqual(['open', 'rejected', 'resolved', 'reviewed']);
    expect(byStatus.open).toEqual([]);
  });
});

describe('ops — isAuditEntryOwnedBy', () => {
  const entry: AuditEntry = {
    id: 'e-1',
    action: 'follow',
    actorId: 'acct-a',
    targetId: 'art-1',
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
