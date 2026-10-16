import { describe, expect, it } from 'vitest';
import type { AccountId } from './community';
import {
  isReportClosed,
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