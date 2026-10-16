import { describe, expect, it } from 'vitest';
import {
  agentGrantExpiryText,
  grantsByScope,
  grantScopeLabel,
  isGrantActive,
} from './agentGrant';
import type { AgentGrant } from './agentGrant';

const grant: AgentGrant = {
  id: 'grant-1',
  agentId: 'agent-external',
  scope: 'publish',
  targetId: 'pub-1',
  grantedAt: 1_700_000_000_000,
  expiresAt: 1_700_086_400_000, // +1 day
};

const now = 1_700_000_000_000;

describe('agentGrant — agentGrantExpiryText', () => {
  it('shows days left when not expired', () => {
    expect(agentGrantExpiryText(grant, now)).toBe('1 d left');
  });

  it('shows Expired when past expiresAt', () => {
    const expired: AgentGrant = { ...grant, expiresAt: now - 1 };
    expect(agentGrantExpiryText(expired, now)).toBe('Expired');
  });

  it('shows Permanent when expiresAt is null', () => {
    const permanent: AgentGrant = { ...grant, expiresAt: null };
    expect(agentGrantExpiryText(permanent, now)).toBe('Permanent');
  });
});

describe('agentGrant — isGrantActive', () => {
  it('true when not expired', () => {
    expect(isGrantActive(grant, now)).toBe(true);
  });

  it('false when expired', () => {
    const expired: AgentGrant = { ...grant, expiresAt: now - 1 };
    expect(isGrantActive(expired, now)).toBe(false);
  });

  it('true when permanent', () => {
    const permanent: AgentGrant = { ...grant, expiresAt: null };
    expect(isGrantActive(permanent, now)).toBe(true);
  });
});

describe('agentGrant — grantScopeLabel', () => {
  it('maps each scope to a label', () => {
    expect(grantScopeLabel('publish')).toBe('发布权限');
    expect(grantScopeLabel('remix')).toBe('混改权限');
    expect(grantScopeLabel('read')).toBe('读取权限');
  });
});

describe('agentGrant — grantsByScope', () => {
  const grants: AgentGrant[] = [
    { ...grant, id: 'g-1', scope: 'publish' },
    { ...grant, id: 'g-2', scope: 'read' },
    { ...grant, id: 'g-3', scope: 'publish' },
    { ...grant, id: 'g-4', scope: 'remix' },
  ];

  it('groups grants by scope without mutating input', () => {
    const byScope = grantsByScope(grants);
    expect(byScope.publish.map((g) => g.id)).toEqual(['g-1', 'g-3']);
    expect(byScope.read.map((g) => g.id)).toEqual(['g-2']);
    expect(byScope.remix.map((g) => g.id)).toEqual(['g-4']);
    expect(grants.length).toBe(4);
  });
});