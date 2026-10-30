package dev.nexus.api.webhooks;

import dev.nexus.api.ops.AuditRecorded;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * M10 v559 — the seam between the trail's WRITE and the ecosystem's OUTBOUND call: one recorded entry, one
 * fan-out.
 *
 * <p>This is the whole producer. {@code AuditService} publishes {@link AuditRecorded} inside the transaction it
 * writes in and knows nothing about webhooks; this listener is what turns that announcement into deliveries,
 * and the dependency arrow points this way and only this way (webhooks → ops). A trail that depended on
 * webhooks could not record an event without a network.
 *
 * <p><b>AFTER_COMMIT is mandatory, not stylistic.</b> An ordinary {@code @EventListener} would POST inside the
 * writing transaction: the delivery leaves before the row does, so a rolled-back publish would be announced to
 * a stranger as a fact — and the service's own trail would say it never happened. The three transaction phases
 * that matter here are stated rather than implied: {@code BEFORE_COMMIT} is still provisional,
 * {@code AFTER_ROLLBACK} is not a thing that happened, and {@code AFTER_COMMIT} is the first moment the fact
 * is true.
 *
 * <p>{@link AuditService}'s {@code record} is {@code @Transactional}, so there is always a transaction to commit
 * (Spring opens one when the caller had none) — the listener therefore fires on every recorded entry rather
 * than only on the calls that happened to arrive inside somebody else's transaction.
 *
 * <p>What this does NOT do: it does not retry, does not record a receipt and does not run off-thread. A
 * delivery happens on the thread that committed the write, bounded by {@link WebhookDispatcher#DELIVERY_TIMEOUT}
 * per subscription — a slow endpoint delays the caller's answer, and that is the trade this slice chose over an
 * outbox it could not yet grade.
 */
@Component
public class WebhookEventListener {

    private final WebhookDispatcher dispatcher;

    public WebhookEventListener(WebhookDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    /** Deliver one recorded fact to every subscription that asked for its verb. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void recorded(AuditRecorded event) {
        dispatcher.deliver(event.action(), event.targetId(), event.at());
    }
}
