import { describe, expect, it } from 'vitest';
import {
  agentGrantExpiryText,
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