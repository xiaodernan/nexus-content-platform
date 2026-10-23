import { describe, expect, it } from 'vitest';

import { claimOf } from './socialClaim';

/**
 * M7 v413 — the CLAIM every social verb travels with, graded directly.
 *
 * The account lives in the BROWSER's storage and the service is one hop behind the Studio's own route,
 * so the claim has to be attached on THIS side of the wire (v288): the server cannot read a browser's
 * localStorage, and the browser must not hold the service's address. ONE builder serves the like,
 * comment, follow, tip, report and subscribe composers, because a claim that six modules each build
 * slightly differently is a claim whose six shapes disagree about the same account.
 *
 * The rules the module's own comment states, now graded: a device with NO account has NO claim — the
 * client does not invent one, because an invented account id is an action nobody took (the service
 * refuses an accountless social act BY NAME, v283/v285/v287). Only the ID gates the claim; the handle
 * and the assurance are what travels WITH it, and a blank one answers null rather than an empty string.
 * And the builder never stamps a TIME: `claimedAt` is null on this side, so a claim says when the
 * SERVICE saw the act, not when the browser decided to make it.
 */
describe('claimOf — the claim a social verb travels with (v413)', () => {
  it('a device with NO account has NO claim — the client does not invent one', () => {
    // An invented account id would be an action nobody took; the service refuses an accountless
    // social act by name, so the honest client answer is no claim at all.
    expect(claimOf(null, null, null)).toBeNull();
  });

  it('an empty accountId is not an account either', () => {
    expect(claimOf('', null, null)).toBeNull();
  });

  it('a whitespace-only accountId is not an account — the check trims', () => {
    expect(claimOf('   ', 'ann', 'unsigned-local')).toBeNull();
  });

  it('the account id travels TRIMMED', () => {
    expect(claimOf(' acc-7 ', 'ann', 'unsigned-local')).toEqual({
      accountId: 'acc-7',
      handle: 'ann',
      assurance: 'unsigned-local',
      claimedAt: null,
    });
  });

  it('an account with neither handle nor assurance still HAS a claim — only the id gates it', () => {
    expect(claimOf('acc-7', null, null)).toEqual({
      accountId: 'acc-7',
      handle: null,
      assurance: null,
      claimedAt: null,
    });
  });

  it('the handle travels trimmed when the account has one', () => {
    expect(claimOf('acc-7', '  ann  ', 'unsigned-local')?.handle).toBe('ann');
  });

  it('a blank handle answers null — an absent handle is a field with nothing in it, not an empty string', () => {
    expect(claimOf('acc-7', '', 'unsigned-local')?.handle).toBeNull();
    expect(claimOf('acc-7', '   ', 'unsigned-local')?.handle).toBeNull();
    expect(claimOf('acc-7', null, 'unsigned-local')?.handle).toBeNull();
  });

  it('the assurance travels trimmed when the account has one', () => {
    expect(claimOf('acc-7', 'ann', '  unsigned-local  ')?.assurance).toBe('unsigned-local');
  });

  it('a blank assurance answers null for the same reason a blank handle does', () => {
    expect(claimOf('acc-7', 'ann', '')?.assurance).toBeNull();
    expect(claimOf('acc-7', 'ann', '  ')?.assurance).toBeNull();
    expect(claimOf('acc-7', 'ann', null)?.assurance).toBeNull();
  });

  it('claimedAt is ALWAYS null on this side — the browser never stamps the time', () => {
    // The interface allows a number so the SERVICE can carry one (the routes read it off the posted
    // claim), but the builder writes none: a claim says when the service saw the act, not when the
    // browser decided to make it.
    expect(claimOf('acc-7', 'ann', 'unsigned-local')?.claimedAt).toBeNull();
  });

  it('one shape for all three fields — six composers cannot disagree about the same account', () => {
    expect(claimOf('  acc-7  ', '  ann  ', '  unsigned-local  ')).toEqual({
      accountId: 'acc-7',
      handle: 'ann',
      assurance: 'unsigned-local',
      claimedAt: null,
    });
  });
});
