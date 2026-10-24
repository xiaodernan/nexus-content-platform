import { describe, expect, it } from 'vitest';

import { ASK_FAILURE_STATUS, askDoorStatus, askFailureKindOf, askFailureStatus, machineFailure } from './doorFailure';

/**
 * M7 v509 (ADR 0016 amendment 502) — the rule an agent door’s status is read by.
 *
 * The rule is one sentence, so the cases are about the EDGES: the table itself (one row per kind), the
 * answer that names no kind, an answer that is ok, and the classifier’s two machine shapes — a raw fs
 * error, which carries its own `code`, and the runtime’s rename wrapper, which keeps the code’s WORDS
 * and drops the field. Everything else is the ask, and the ask is the default.
 */
describe('doorFailure — whose fault it was (v509)', () => {
  it('the table: the ask earns 400, the machine earns 503', () => {
    expect(ASK_FAILURE_STATUS['the-ask']).toBe(400);
    expect(ASK_FAILURE_STATUS['the-machine']).toBe(503);
    expect(askFailureStatus('the-ask')).toBe(400);
    expect(askFailureStatus('the-machine')).toBe(503);
  });

  it('an answer that names no kind is a refused ask — the safe default, exactly as v507 chose it', () => {
    // A door that cannot tell must not claim the machine is broken: every site that KNOWS the machine
    // failed marks itself, so an unmarked failure is one where the ask itself was the problem.
    expect(askFailureStatus(undefined)).toBe(400);
  });

  it('a whole answer earns 200 when the door answered and nothing failed', () => {
    expect(askDoorStatus({ ok: true })).toBe(200);
    expect(askDoorStatus({ ok: false })).toBe(400);
  });

  it('the deploy door’s honest “failed” verdict is a 503, not a 200 — the kind, not ok, decides', () => {
    // The arc answers ok:true with status “failed” and the machine’s own words when the records sink
    // could not take them. A 200 there would tell the caller the deploy was attempted.
    // Named, not inline: the door's answers carry their own fields beside the kind.
    const failedVerdict = { ok: true, status: 'failed', failure: 'the-machine' as const };
    const refusedAsk = { ok: false, reason: 'argv must be a non-empty array', failure: 'the-ask' as const };
    expect(askDoorStatus(failedVerdict)).toBe(503);
    expect(askDoorStatus(refusedAsk)).toBe(400);
  });

  it('a raw fs error carries its own code, and the code is the machine’s', () => {
    // node:fs errors always carry one: ENOSPC, EACCES, EISDIR, EPERM…
    const enospc = Object.assign(new Error("no space left on device, open '.nexus/scene-saves/x.tmp'"), { code: 'ENOSPC' });
    const eacces = Object.assign(new Error("permission denied, open '.nexus/scene-saves/x.tmp'"), { code: 'EACCES' });
    expect(askFailureKindOf(enospc)).toBe('the-machine');
    expect(askFailureKindOf(eacces)).toBe('the-machine');
  });

  it('the runtime’s rename wrapper is the machine’s — it kept the failed syscall’s words and dropped the field', () => {
    // The store wraps a failed rename: saveStore: renaming “x.tmp” onto “x” failed (ENOSPC: …). The code is
    // inside the sentence now, and the wrapper’s own opening words are how it is known.
    const wrapped = new Error('saveStore: renaming ".nexus/scene-saves/x.tmp" onto "x" failed (ENOSPC: no space left on device); whatever was already at "x" is untouched, and the temp file was removed');
    expect(askFailureKindOf(wrapped)).toBe('the-machine');
    const durable = new Error('saveStore: flushing and renaming ".nexus/scene-saves/x.tmp" onto "x" failed (EIO: i/o error)');
    expect(askFailureKindOf(durable)).toBe('the-machine');
  });

  it('the store’s naming refusals are the ask’s — sentences with no code in them', () => {
    // Every one of these is a name the caller chose, refused by the tested naming rules.
    const refusals = [
      'saveStore: "C:/escape.json" is an absolute path; a save is named inside the store’s own namespace, never by a location on disk',
      'saveStore: "a/../escape.json" walks out of the store with ".."; save names are relative and stay inside',
      'saveStore: "x.tmp" ends in the temp suffix ".tmp", which is where writeAtomic("x") puts its half-written file',
      'saveStore: "gone" does not exist',
    ];
    for (const refusal of refusals) expect(askFailureKindOf(new Error(refusal))).toBe('the-ask');
  });

  it('a name that merely CONTAINS code-shaped bytes is still the ask — the classifier never reads codes out of a caller’s name', () => {
    // The rename wrapper is recognized by its opening sentence, never by scanning for a code anywhere in
    // the message: a caller could name a save “failed (ENOSPC: x”, and a scanner would call the disk broken.
    const adversarial = new Error('saveStore: "failed (ENOSPC: x" is an absolute path; a save is named inside the store’s own namespace');
    expect(askFailureKindOf(adversarial)).toBe('the-ask');
  });

  it('a thrown non-Error is the ask — the door does not invent a machine it was not shown', () => {
    expect(askFailureKindOf('boom')).toBe('the-ask');
    expect(askFailureKindOf(null)).toBe('the-ask');
    expect(askFailureKindOf(42)).toBe('the-ask');
  });

  it('machineFailure stamps the kind and keeps the machine’s own words', () => {
    const answer = machineFailure('the container exec', new Error('spawn docker ENOENT'));
    expect(answer.ok).toBe(false);
    expect(answer.failure).toBe('the-machine');
    expect(answer.reason).toBe('the container exec threw instead of answering: spawn docker ENOENT');
    expect(askDoorStatus(answer)).toBe(503);
  });
});
