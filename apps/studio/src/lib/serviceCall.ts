/**
 * M7 v337 — the Studio's own door to the service, and how long it waits.
 *
 * <p>Every door in this folder (comments, likes, follows, the economy, the moderation desk, the plans,
 * the tips) fetched the service with NO budget — a service that never answered left the Studio's route
 * waiting forever. For a SERVER-RENDERED page (the artifact page, the explore page, the profile page) that
 * is a reader waiting forever, with no sentence and no reason.
 *
 * <p>The house's rule — "a failed read is NOT an empty list" — has nothing to say about a read that never
 * fails, so the read has to be BOUNDED, and the bound has to be NAMED: the panel says "could not read:
 * …" with the service's own reason, or with the timeout's own.
 *
 * <p>The budget is 15 seconds: long enough for a cold first write on a busy machine, short enough that a
 * reader is not left waiting. The publish door keeps its own 45 seconds — a WRITE, and the one door v294
 * already gave a budget to.
 */

/** How long the Studio's own door waits for the service. */
export const SERVICE_CALL_TIMEOUT_MS = 15_000;

/** A signal that stops a call to the service that is not answered in time. */
export function serviceCallSignal(): AbortSignal {
  return AbortSignal.timeout(SERVICE_CALL_TIMEOUT_MS);
}

/**
 * Why a call to the service did not answer.
 *
 * <p>A TIMEOUT is not an unreachable service: the service may well be there, and slow. Saying
 * "unreachable" about a service that is merely busy is the same kind of lie the house's rule about
 * failed reads is about — a reader who is told the thing is gone when it is only late will stop looking
 * for it.
 */
export function serviceUnreachableReason(apiBase: string, error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `the service at ${apiBase} did not answer within ${SERVICE_CALL_TIMEOUT_MS / 1000} seconds`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `nexus-api unreachable at ${apiBase}: ${message}`;
}

/**
 * v507 — the two kinds of “no” a door can get from the service, and the one status each earns.
 *
 * <p>Every door here asks the service through a lib in this folder, and every lib answers a failed
 * ask the house’s way: with a REASON, never a thrown error (v284’s rule). But “no” is two different
 * truths, and until now the doors answered them with whichever number their own author reached for:
 * the doors written in the v284–v298 wave answer 503, the doors written in the v305–v335 wave answer
 * 502, and the plans door answers BOTH — 502 for a read that failed and 503 for a write that failed
 * the same way. v499 graded the split and called it a contract; the audit that followed it found no
 * comment anywhere defending either number, which makes it an accident of authoring order rather
 * than a decision.
 *
 * <p>So the kinds are named here, once, and every door’s status is DERIVED from them:
 *
 * <p>  · `unreachable` — the call produced no answer at all: the connection failed, or the 15-second
 *      budget ran out. The service may be there and slow, and the door says only what it knows: it
 *      could not get an answer. That is a 503, and it is the truth.
 * <p>  · `invalid` — an answer arrived and it was one the door cannot serve: a refusal by name, an
 *      HTTP error, a body that is not JSON, or a body missing the fields the reader needs. The
 *      service SPOKE; what it said could not be used. That is a 502, and it is the truth.
 *
 * <p>The rule is one sentence: **a door answers 503 when the service did not answer, and 502 when it
 * answered and the answer could not be served.** A door no longer picks a number — it reads the kind
 * off the answer, so a door written tomorrow keeps the house rule without being told it twice.
 */

/** Which kind of “no” a failed ask got. */
export type ServiceFailureKind =
  /** No answer arrived: the service was unreachable, or did not answer within the budget. */
  | 'unreachable'
  /** An answer arrived and could not be served: a refusal, an HTTP error, or an unreadable body. */
  | 'invalid';

/** The one status each kind earns — the whole of the rule, in a table a test can read. */
export const SERVICE_FAILURE_STATUS: Record<ServiceFailureKind, 502 | 503> = {
  unreachable: 503,
  invalid: 502,
};

/**
 * The status a door answers when the service could not serve the ask.
 *
 * <p>A failure that names no kind is an INVALID one, and that is not an omission: every site that
 * could not get an answer at all marks itself `unreachable`, so a failure without the mark is one
 * where the service DID answer and the answer could not be used. The default is the safe one — a
 * door never claims a service is down when all it knows is that the answer was no good.
 */
export function serviceFailureStatus(failure: ServiceFailureKind | undefined): 502 | 503 {
  return SERVICE_FAILURE_STATUS[failure ?? 'invalid'];
}
