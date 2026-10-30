package dev.nexus.api.webhooks;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * M10 v560 — the delivery LOG: every attempt is written down, and the owner can read back what happened.
 *
 * <p>v559's fan-out returned its answers to a listener nobody was waiting on, so a delivery that failed was a
 * fact that existed for one microsecond. This is the table that keeps it: one row per ATTEMPT, written on every
 * path the dispatcher takes — the on-demand {@code ping} and the after-commit fan-out alike — and read back
 * through a door scoped to the subscriber who owns the subscription.
 *
 * <p>Two decisions carry the weight:
 *
 * <ul>
 *   <li><b>The write runs in its OWN transaction ({@code REQUIRES_NEW}).</b> The fan-out is an
 *       {@code AFTER_COMMIT} listener: the caller's transaction is already committed and its persistence
 *       context is still bound to the thread, so a receipt saved with the DEFAULT propagation would join a
 *       finished transaction and quietly never commit. {@code REQUIRES_NEW} suspends that context and commits
 *       the row on its own — which is also why the ping path records through the SAME method rather than a
 *       second call site with its own rules. The cost is stated: one commit per attempt, not one per event.
 *   <li><b>The row carries its own copy of what it was about.</b> The subscriber, the event, the target and
 *       both instants live on the receipt rather than behind a join, so a receipt survives the removal of the
 *       subscription that produced it — a take-down must not erase the record of having called that endpoint.
 * </ul>
 *
 * <p>Bound, stated: nothing prunes this table. It grows with every attempt of every subscriber, and a
 * retention rule (how long a receipt is kept, and who may delete one) is a later decision rather than an
 * assumption here.
 */
@Component
public class WebhookDeliveryLog {

    /** The default number of receipts a listing answers with. */
    public static final int DEFAULT_LIST_LIMIT = 20;

    /** The most a caller may ask for. */
    public static final int MAX_LIST_LIMIT = 100;

    /** Stated so the annotation's choice is a value a reader (and a test) can pin, not a word to trust. */
    public static final Propagation PROPAGATION = Propagation.REQUIRES_NEW;

    private final WebhookDeliveryRepository repository;
    private final Clock clock;

    public WebhookDeliveryLog(WebhookDeliveryRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /**
     * Write one attempt down.
     *
     * <p>The two instants are passed rather than read here: {@code eventAt} is the fact's own instant (the
     * trail's, or the ping's), and {@code attemptedAt} is this service's clock at the moment of the POST.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            WebhookSubscription row,
            String event,
            String targetId,
            Instant eventAt,
            String outcome,
            Integer status,
            String detail) {
        Instant attemptedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
        repository.save(new WebhookDelivery(
                UUID.randomUUID().toString(),
                row.getWebhookId(),
                row.getSubscriberAccountId(),
                event,
                targetId,
                outcome,
                status,
                detail,
                eventAt.truncatedTo(ChronoUnit.MICROS),
                attemptedAt));
    }

    /**
     * The subscriber's receipts, newest first, capped and paged — narrowed to ONE subscription when one is
     * named, and not narrowed when the name is blank.
     *
     * <p>The narrowing happens IN THE QUERY: "the newest N receipts OF THAT subscription" is a different set
     * from "the newest N receipts that happen to be of that one" once the log outgrows the cap, and the reader
     * asked the first question (the same rule the audit trail's filter follows, v385).
     *
     * <p>The offset is ROWS, translated into the page index Spring Data speaks (the trail's window, v388).
     * Stated bound: an offset that is not a whole number of windows floors to the page CONTAINING it — so a
     * caller who pages with one window size and then switches size can be shown a row twice, never a gap.
     */
    @Transactional(readOnly = true)
    public List<WebhookDelivery> deliveriesOf(String subscriberId, String webhookId, int limit, int offset) {
        String subscriber = WebhookService.requireSubscriber(subscriberId);
        int effective = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
        int from = Math.max(offset, 0);
        PageRequest window = PageRequest.of(from / effective, effective);
        String narrowed = webhookId == null || webhookId.isBlank() ? null : webhookId.trim();
        return narrowed == null
                ? repository.findBySubscriberAccountIdOrderByAttemptedAtDescDeliveryIdDesc(subscriber, window)
                : repository.findBySubscriberAccountIdAndWebhookIdOrderByAttemptedAtDescDeliveryIdDesc(
                        subscriber, narrowed, window);
    }

    /** The subscriber's WHOLE number of receipts, narrowed exactly as the window is. */
    @Transactional(readOnly = true)
    public long countOf(String subscriberId, String webhookId) {
        String subscriber = WebhookService.requireSubscriber(subscriberId);
        String narrowed = webhookId == null || webhookId.isBlank() ? null : webhookId.trim();
        return narrowed == null
                ? repository.countBySubscriberAccountId(subscriber)
                : repository.countBySubscriberAccountIdAndWebhookId(subscriber, narrowed);
    }
}
