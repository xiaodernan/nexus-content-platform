import { describe, expect, it } from 'vitest';
import {
  agentGrantExpiryText,
  grantRemainingDays,
  grantsByAgentId,
  grantsByScope,
  grantScopeLabel,
  isGrantActive,
  isGrantExpiringSoon,
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

describe('agentGrant — grantsByAgentId', () => {
  const grants: AgentGrant[] = [
    { ...grant, id: 'a-1', agentId: 'agent-a' },
    { ...grant, id: 'a-2', agentId: 'agent-b' },
    { ...grant, id: 'a-3', agentId: 'agent-a' },
  ];

  it('groups grants by agentId without mutating input', () => {
    const byAgent = grantsByAgentId(grants);
    expect((byAgent['agent-a'] ?? []).map((g) => g.id)).toEqual(['a-1', 'a-3']);
    expect((byAgent['agent-b'] ?? []).map((g) => g.id)).toEqual(['a-2']);
    expect(byAgent['agent-c']).toBeUndefined();
    expect(grants.length).toBe(3);
  });
});

describe('agentGrant — isGrantExpiringSoon', () => {
  const now = 1_700_000_000_000;

  it('false when permanent', () => {
    const permanent: AgentGrant = { ...grant, expiresAt: null };
    expect(isGrantExpiringSoon(permanent, now)).toBe(false);
  });

  it('false when already expired', () => {
    const expired: AgentGrant = { ...grant, expiresAt: now - 1 };
    expect(isGrantExpiringSoon(expired, now)).toBe(false);
  });

  it('true when within threshold (default 7 days)', () => {
    const soon: AgentGrant = { ...grant, expiresAt: now + 3 * 24 * 60 * 60 * 1000 };
    expect(isGrantExpiringSoon(soon, now)).toBe(true);
  });

  it('false when beyond threshold', () => {
    const far: AgentGrant = { ...grant, expiresAt: now + 10 * 24 * 60 * 60 * 1000 };
    expect(isGrantExpiringSoon(far, now)).toBe(false);
  });
});

describe('agentGrant — grantRemainingDays', () => {
  const now = 1_700_000_000_000;

  it('null when permanent', () => {
    expect(grantRemainingDays({ ...grant, expiresAt: null }, now)).toBe(null);
  });

  it('0 when already expired', () => {
    expect(grantRemainingDays({ ...grant, expiresAt: now - 1 }, now)).toBe(0);
    expect(grantRemainingDays({ ...grant, expiresAt: now }, now)).toBe(0);
  });

  it('whole days when future', () => {
    expect(grantRemainingDays({ ...grant, expiresAt: now + 2 * 24 * 60 * 60 * 1000 }, now)).toBe(2);
    expect(grantRemainingDays({ ...grant, expiresAt: now + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 }, now)).toBe(2);
  });
});