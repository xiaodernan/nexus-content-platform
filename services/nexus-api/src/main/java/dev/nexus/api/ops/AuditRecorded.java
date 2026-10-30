package dev.nexus.api.ops;

import java.time.Instant;

/**
 * M10 v559 — the trail's IN-TRANSACTION announcement: an entry was written, and here is what it names.
 *
 * <p>The audit trail has been the service's own record of what happened since v271, and this is the first
 * slice that lets the rest of the system hear it. The record is deliberately THREE facts — the verb, the id
 * of the thing it happened to, and the instant — because that is exactly the body a webhook subscriber
 * receives; a subscriber asking for {@code publish} wants to know WHICH publication, not who was holding the
 * pen, and an event that grew an actor field would put that person's id on a stranger's server.
 *
 * <p>The event is published INSIDE the writing transaction, and the listener is what decides when it becomes
 * outward-facing: the webhook fan-out is an AFTER_COMMIT listener, because a delivery sent before the commit
 * could announce a fact that a rollback then un-does. That ordering is the listener's rule, not this record's
 * — this record only says what happened, and says it while the fact is still provisional.
 *
 * <p>Who listens is not the trail's business either: {@link AuditService} depends on
 * {@code ApplicationEventPublisher} and nothing in {@code webhooks}, so the dependency arrow points from
 * webhooks to ops and never back. A trail that knew about deliveries would be a trail that could not be
 * recorded without a network.
 */
public record AuditRecorded(String action, String targetId, Instant at) {
}
