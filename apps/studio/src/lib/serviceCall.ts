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
