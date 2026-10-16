import { describe, expect, it } from 'vitest';
import type { Assurance } from './assurance';
import {
  isKnownAssurance,
  KNOWN_ASSURANCES,
  renderOwnerLine,
  renderOwnerLineWithBadge,
  assuranceLabel,
  badgeTextFor,
} from './assurance';

describe('assurance — known values', () => {
  it('KNOWN_ASSURANCES contains unsigned-local and verified', () => {
    expect(KNOWN_ASSURANCES.has('unsigned-local')).toBe(true);
    expect(KNOWN_ASSURANCES.has('verified')).toBe(true);
    expect(KNOWN_ASSURANCES.size).toBe(2);
  });

  it('isKnownAssurance accepts known values and rejects unknown ones', () => {
    expect(isKnownAssurance('unsigned-local')).toBe(true);
    expect(isKnownAssurance('verified')).toBe(true);
    expect(isKnownAssurance('full-verified')).toBe(false);
    expect(isKnownAssurance(null)).toBe(false);
    expect(isKnownAssurance(42)).toBe(false);
    expect(isKnownAssurance(undefined)).toBe(false);
    expect(isKnownAssurance('')).toBe(false);
  });
});

describe('assurance — renderOwnerLine', () => {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('renders `by <handle> · <assurance>` for an unsigned-local owner', () => {
    expect(renderOwnerLine({ handle: 'ada', assurance: 'unsigned-local' }, escape)).toBe(
      'by ada · unsigned-local',
    );
  });

  it('renders `by <handle> · verified` for a verified owner', () => {
    expect(renderOwnerLine({ handle: 'ada', assurance: 'verified' }, escape)).toBe(
      'by ada · verified',
    );
  });

  it('returns null when there is no owner', () => {
    expect(renderOwnerLine(null, escape)).toBeNull();
  });

  it('escapes caller-controlled handle text', () => {
    expect(renderOwnerLine({ handle: '<script>x</script>', assurance: 'unsigned-local' }, escape)).toBe(
      'by &lt;script&gt;x&lt;/script&gt; · unsigned-local',
    );
  });
});

describe('assurance — renderOwnerLineWithBadge', () => {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('adds no badge for unsigned-local', () => {
    expect(renderOwnerLineWithBadge({ handle: 'ada', assurance: 'unsigned-local' }, escape)).toBe(
      'by ada · unsigned-local',
    );
  });

  it('adds a `(verified)` badge for verified', () => {
    expect(renderOwnerLineWithBadge({ handle: 'ada', assurance: 'verified' }, escape)).toBe(
      'by ada · verified (verified)',
    );
  });

  it('returns null when there is no owner', () => {
    expect(renderOwnerLineWithBadge(null, escape)).toBeNull();
  });
});

describe('assurance — assuranceLabel / badgeTextFor', () => {
  it('assuranceLabel maps each assurance to a label', () => {
    expect(assuranceLabel('unsigned-local')).toBe('未验证');
    expect(assuranceLabel('verified')).toBe('已认证');
  });

  it('badgeTextFor returns badge only for verified', () => {
    expect(badgeTextFor('verified')).toBe(' (已认证)');
    expect(badgeTextFor('unsigned-local')).toBeNull();
  });
});