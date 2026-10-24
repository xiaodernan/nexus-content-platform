/**
 * M7 v509 (ADR 0016 amendment 502) — the two kinds of “no” an AGENT door answers, and the one status each earns.
 *
 * <p>v507 named the two kinds of “no” a door gets from the SERVICE and derived every service door’s status
 * from them: 503 when the service did not answer, 502 when it answered and the answer could not be served. The
 * five AGENT doors — container, build-arc, deploy, save-fs, world-saves — were not in that rule, and they
 * answer a failure with whichever number their own author reached for: every one of them answers 400 for
 * `ok: false`. That single number covers two different truths. A malformed argv, a name the store refuses and
 * bytes that are not a save are the CALLER’s to see, and 400 is the honest answer for them. But the same 400
 * is answered when the MACHINE failed — the injected fs threw EACCES, the records file would not take the
 * engine’s words, docker is not on this machine at all — and a caller who is told their ask was bad when the
 * disk was full will go rewrite an ask that was never the problem. And when the lib behind a door throws instead
 * of answering, nothing catches it: the route dies with a bare 500 and no sentence at all.
 *
 * <p>So the kinds are named here, once, the way v507 named them, and every agent door’s status is DERIVED
 * from them:
 *
 * <p>  · `the-ask` — the caller’s ask was refused: a malformed argv, a name the store will not take, bytes that
 *      are not a save, an action the door does not speak. Nothing is wrong with the machine; the question was
 *      answerable and the answer is “no, and here is why”. That is a 400.
 * <p>  · `the-machine` — the machine failed: the injected fs threw a system error, the store could not be built,
 *      the records file said no, or the lib threw instead of answering. The ask may have been perfectly fine;
 *      the door could not perform it. That is a 503.
 *
 * <p>The rule is one sentence: **a door answers 400 when the ask was refused, 503 when the machine failed, and
 * 200 when the door answered.** A door no longer picks a number — it reads the kind off the answer, and an
 * answer that names no kind is a refused ask, because that is the safe default: a door never claims the machine
 * is broken when all it knows is that the ask was no good.
 */

/** Which kind of “no” an agent door answered. */
export type AskFailureKind =
  /** The caller’s ask was refused — the question was answerable, and the answer is no. */
  | 'the-ask'
  /** The machine failed — the ask may have been fine; the door could not perform it. */
  | 'the-machine';

/** The one status each kind earns — the whole of the rule, in a table a test can read. */
export const ASK_FAILURE_STATUS: Record<AskFailureKind, 400 | 503> = {
  'the-ask': 400,
  'the-machine': 503,
};

/**
 * The status a door answers when it could not say yes.
 *
 * <p>A failure that names no kind is a refused ask, and that is not an omission: every site that knows the
 * machine failed marks itself `the-machine`, so a failure without the mark is one where the ask itself was
 * the problem. The default is the safe one — the same choice v507 made for the service doors — because a door
 * that cannot tell must not claim the machine is broken.
 */
export function askFailureStatus(failure: AskFailureKind | undefined): 400 | 503 {
  return ASK_FAILURE_STATUS[failure ?? 'the-ask'];
}

/**
 * The status a door answers for a whole answer — the one line every agent route now ends on.
 *
 * <p>200 when the door answered and nothing failed; otherwise the status the answer’s kind earns. The deploy
 * door is why this reads the kind and not `ok`: its arc answers `ok: true` with the verdict “failed” and the
 * machine’s own words when the records sink could not take them, and a 200 for that would tell the caller the
 * deploy was attempted when the truth is that this server could not perform it.
 */
export function askDoorStatus(answer: { ok: boolean; failure?: AskFailureKind }): 200 | 400 | 503 {
  return answer.ok && answer.failure === undefined ? 200 : askFailureStatus(answer.failure);
}

/**
 * The answer a door gives when the machine failed BEFORE the door could answer: the lib threw instead of
 * answering, which the house’s own rule (v284: a lib answers a failed ask with a reason, never a thrown error)
 * says a lib never does. The machine’s own words ride the answer — the thrown error’s message, paraphrased by
 * nobody — and the kind is stamped on it, so the door’s status is derived like every other.
 */
export function machineFailure(what: string, error: unknown): { ok: false; reason: string; failure: 'the-machine' } {
  const words = error instanceof Error ? error.message : String(error);
  return { ok: false, reason: `${what} threw instead of answering: ${words}`, failure: 'the-machine' };
}

/**
 * Run a lib ask and keep the door’s promise: an answer comes back as an answer, and a THROW becomes the
 * machine’s own failure. Without this, a lib that throws takes the whole route down — a bare 500 with no
 * sentence, which is the one answer this house never gives a caller.
 */
export async function askOrMachineFailure<T extends { ok: boolean }>(
  what: string,
  call: () => T | Promise<T>,
): Promise<T | ReturnType<typeof machineFailure>> {
  try {
    return await call();
  } catch (error) {
    return machineFailure(what, error);
  }
}

/**
 * Which kind of “no” a THROWN error is.
 *
 * <p>The libs behind the agent doors answer the house’s way, so a throw is already news: something the lib did
 * not expect happened, and the door has to say whose it was. Most of the time it is the machine. Every
 * `node:fs` error carries a `code` of its own — ENOSPC, EACCES, EISDIR, EPERM — so a raw fs failure names itself.
 * The one exception is the runtime’s `writeAtomic` wrapper, which keeps the failed syscall’s WORDS and drops
 * its field: `saveStore: renaming “x.tmp” onto “x” failed (ENOSPC: …)`. That wrapper is recognized by its own
 * opening sentence and never by scanning the message for a code — a caller’s save NAME could contain anything,
 * and a classifier that read codes out of caller-chosen bytes would misread a name as a disk.
 *
 * <p>Everything else is the ask. The store’s own naming refusals are sentences with no code in them, and a
 * refused name is the caller’s to see.
 */
const RENAME_WRAPPER = /^saveStore: (?:flushing and )?renaming "/;

export function askFailureKindOf(error: unknown): AskFailureKind {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && code !== '') return 'the-machine';
  const message = error instanceof Error ? error.message : String(error);
  if (RENAME_WRAPPER.test(message)) return 'the-machine';
  return 'the-ask';
}
