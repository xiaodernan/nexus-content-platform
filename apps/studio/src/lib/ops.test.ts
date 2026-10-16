import { describe, expect, it } from 'vitest';
import type { AccountId } from './community';
import {
  auditEntriesForTarget,
  auditEntriesSince,
  isReportClosed,
  reportStatsText,
  reportStatusText,
} from './ops';
import type { AuditEntry, Report } from './ops';

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