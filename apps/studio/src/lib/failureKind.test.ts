import { describe, expect, it, vi } from 'vitest';

import { readAuditTrail } from './auditServer';
import { readCommentsWritten } from './commentServer';
import {
  readPlans as readCreatorPlans,
  readReceivedSubscriptions,
  readSubscriptions as readEconomySubscriptions,
} from './economyServer';
import { readFollowing } from './followServer';
import { readLikes } from './likeServer';
import { readDesk } from './moderationServer';
import { readPlans, readSubscriptions as readPlanSubscriptions } from './planServer';
import { readFiledReports } from './reportServer';
import { readTips } from './tipServer';

/**
 * M7 v507 (ADR 0016 amendment 500) — every door lib NAMES the kind of “no” it got.
 *
 * The gap. Until v507 a failed ask answered `ok: false` with a reason and nothing else, so the door
 * above it had to GUESS which HTTP number the failure earned — and it guessed differently depending on
 * when the door was written (v499 measured the result: a 502 on six doors, a 503 on three, and the plans
 * door answering both). The guess was not the lib’s fault and not the door’s: the lib knew which kind of
 * failure it had and threw the knowledge away, keeping only the sentence.
 *
 * The proof. Each lib’s failure answers now carry `failure`, and this file asks every read in the house
 * the same two questions: what does a call that THREW answer, and what does a call that was ANSWERED
 * with a refusal answer. Nine libs, eighteen cases. A lib that stops naming its kind fails here, and a
 * door that hardcodes a number again fails in door-contract.test.ts — the two halves of the rule are
 * graded on both sides of the seam.
 */

/** A call that never produced an answer: the service was not there. */
function throwingFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error('nexus-api unreachable');
  }) as unknown as typeof fetch;
}

/** A call the service ANSWERED with a refusal — the service spoke, and the answer was no good. */
function refusingFetch(): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ ok: false, reason: 'the service is down' }), { status: 502 }),
  ) as unknown as typeof fetch;
}

type AnswerShape = { ok: boolean; failure?: string; reason?: string };

const readers: Array<[string, (fetchImpl: typeof fetch) => Promise<AnswerShape>]> = [
  ['commentServer.readCommentsWritten', (f) => readCommentsWritten('acct-ada', 20, f)],
  ['followServer.readFollowing', (f) => readFollowing('acct-ada', 0, f)],
  ['likeServer.readLikes', (f) => readLikes('pub-1', 20, 0, f)],
  ['tipServer.readTips', (f) => readTips('acct-ada', 20, 0, f)],
  ['reportServer.readFiledReports', (f) => readFiledReports('acct-ada', 0, 20, f)],
  ['moderationServer.readDesk', (f) => readDesk('acct-ada', 20, null, 0, f)],
  ['economyServer.readSubscriptions', (f) => readEconomySubscriptions('acct-ada', 20, 0, f)],
  ['economyServer.readReceivedSubscriptions', (f) => readReceivedSubscriptions('acct-grace', 20, 0, f)],
  ['economyServer.readPlans', (f) => readCreatorPlans('acct-grace', 20, 0, f)],
  ['planServer.readPlans', (f) => readPlans('acct-grace', 20, 0, f)],
  ['planServer.readSubscriptions', (f) => readPlanSubscriptions('acct-ada', f)],
  ['auditServer.readAuditTrail', (f) => readAuditTrail(20, f)],
];

describe('the door libs name the kind of “no” they got (v507)', () => {
  for (const [name, read] of readers) {
    it(`${name} marks a THROWN call as unreachable`, async () => {
      const answer = await read(throwingFetch());
      expect(answer.ok).toBe(false);
      expect(answer.failure).toBe('unreachable');
      expect(answer.reason).toContain('nexus-api unreachable');
    });

    it(`${name} marks an ANSWERED refusal as invalid`, async () => {
      const answer = await read(refusingFetch());
      expect(answer.ok).toBe(false);
      expect(answer.failure).toBe('invalid');
    });
  }
});
