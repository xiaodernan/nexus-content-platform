package dev.nexus.api.webhooks;

import dev.nexus.api.webhooks.WebhookDtos.WebhookHealth;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
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
 * <p>Bound, stated: the table grows with every attempt of every subscriber, and since v569 its OWNER may prune
 * it by naming an instant — every receipt attempted strictly before that instant is removed, and everything at
 * or after it survives. There is still no automatic retention: nothing is deleted without an owner's request,
 * so a subscriber that never prunes keeps every receipt it ever earned.
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
     * Write ONE first knock down: a fan-out's attempt or a ping's.
     *
     * <p>The two instants are passed rather than read here: {@code eventAt} is the fact's own instant (the
     * trail's, or the ping's), and {@code attemptedAt} is this service's clock at the moment of the write.
     * {@code deliveryId} is the id the dispatcher already put on the wire (v563): the receipt and the header a
     * subscriber holds name the SAME knock, which is the whole point of minting it before the POST.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
            WebhookSubscription row,
            String deliveryId,
            String event,
            String targetId,
            Instant eventAt,
            String outcome,
            Integer status,
            String detail) {
        write(deliveryId, row, event, targetId, eventAt, outcome, status, detail, null);
    }

    /**
     * v563 — write a REDELIVERY down: the same fact, a new knock, and the receipt it repeats named.
     *
     * <p>The fact's three columns (event, target, {@code eventAt}) are taken from the SOURCE receipt rather
     * than from arguments, so a redelivery cannot disagree with the receipt it repeats about what was said;
     * only the outcome, the status and the detail are this attempt's own.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRedelivery(
            WebhookSubscription row,
            String deliveryId,
            WebhookDelivery source,
            String outcome,
            Integer status,
            String detail) {
        write(deliveryId, row, source.getEvent(), source.getTargetId(), source.getEventAt(), outcome, status,
                detail, source.getDeliveryId());
    }

    /** The one persistence path both write doors share, so no caller can write a row with its own rules. */
    private void write(
            String deliveryId,
            WebhookSubscription row,
            String event,
            String targetId,
            Instant eventAt,
            String outcome,
            Integer status,
            String detail,
            String redeliveryOf) {
        Instant attemptedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
        repository.save(new WebhookDelivery(
                deliveryId,
                row.getWebhookId(),
                row.getSubscriberAccountId(),
                event,
                targetId,
                outcome,
                status,
                detail,
                eventAt.truncatedTo(ChronoUnit.MICROS),
                attemptedAt,
                redeliveryOf));
    }

    /**
     * v563 — ONE receipt by its id, for the redelivery door.
     *
     * <p>{@code readOnly}: the log is not changed by asking what it holds. The ownership question is the
     * dispatcher's (it compares the receipt's subscriber with the one that asked), and the answer to "who does
     * this belong to" travels ON the row — the reason the subscriber is carried here rather than joined.
     *
     * @throws InvalidWebhook when no id was named — a redelivery with no subject is a 400
     * @throws NoSuchDelivery when the id names no receipt — 404, not "the endpoint refused"
     */
    @Transactional(readOnly = true)
    public WebhookDelivery find(String deliveryId) {
        if (deliveryId == null || deliveryId.isBlank()) {
            throw new InvalidWebhook("a redelivery needs the receipt it repeats");
        }
        return repository.findById(deliveryId.trim())
                .orElseThrow(() -> new NoSuchDelivery("receipt \"" + deliveryId.trim() + "\" does not exist"));
    }

    /**
     * v569 — the owner's RETENTION door: remove every receipt attempted STRICTLY before {@code beforeMillis}.
     *
     * <p>This is the one write that REMOVES rows, so its rules are the answer's shape:
     *
     * <ul>
     *   <li>The subscriber is required and scopes the delete IN the query: a prune can only ever reach receipts
     *       that carry the asking account's id, so "delete somebody else's log" is not a refusal this door has
     *       to make — it is a statement it cannot express.
     *   <li>The instant is required, positive and not in the future. A missing instant would mean "delete
     *       everything as of now" with no cutoff to read back, and a future one would mean the same while
     *       claiming a boundary that does not exist yet; both are refused BEFORE any delete runs.
     *   <li>{@code beforeMillis} is exclusive: a receipt attempted at the cutoff instant survives. Times are
     *       epoch MILLISECONDS on the wire while receipts keep microseconds, so a row from the cutoff's
     *       millisecond is after the cutoff and stays.
     * </ul>
     *
     * <p>The delete joins ONE transaction (unlike the per-attempt writes, there is no finished transaction to
     * escape): a prune is all-or-nothing, and the count it answers is the number it actually removed.
     */
    @Transactional
    public long prune(String subscriberId, String webhookId, long beforeMillis) {
        String subscriber = WebhookService.requireSubscriber(subscriberId);
        Instant cutoff = cutoff(beforeMillis);
        String narrowed = webhookId == null || webhookId.isBlank() ? null : webhookId.trim();
        return narrowed == null
                ? repository.deleteBySubscriberAccountIdAndAttemptedAtBefore(subscriber, cutoff)
                : repository.deleteBySubscriberAccountIdAndWebhookIdAndAttemptedAtBefore(
                        subscriber, narrowed, cutoff);
    }

    /** One place decides what a cutoff may be, so the two delete doors cannot disagree about it. */
    private Instant cutoff(long beforeMillis) {
        if (beforeMillis <= 0) {
            throw new InvalidWebhook(
                    "a prune must name the instant it keeps — every receipt older than it is removed, and there is "
                            + "no epoch-zero prune");
        }
        Instant cutoff = Instant.ofEpochMilli(beforeMillis);
        if (cutoff.isAfter(clock.instant())) {
            throw new InvalidWebhook(
                    "a prune cannot name an instant in the future — it would delete receipts that have not been "
                            + "written yet");
        }
        return cutoff;
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

    /**
     * v570 — the owner's HEALTH door: one subscription's record, READ off its receipts rather than summarised
     * by a field somebody would have to keep in step.
     *
     * <p>Four queries, and each answers a question the log actually holds:
     *
     * <ul>
     *   <li>The three outcome counts (delivered / refused / unreachable) over the subscription's WHOLE log,
     *       not a window — a health answer that counted only its newest page would call a failing endpoint
     *       healthy once the failures older than one page.
     *   <li>The newest attempt, and the newest DELIVERY. Both are one row: the id breaks an instant tie, so
     *       "newest" is a total order rather than whichever row the table happened to answer.
     *   <li>{@code attemptsSinceLastDelivery} — receipts attempted STRICTLY after the newest delivery's instant,
     *       or every receipt when nothing ever delivered. Strictly, so an attempt sharing that microsecond is
     *       not counted as a failure the delivery did not have.
     * </ul>
     *
     * <p>No receipt means zeros and nulls, not a guessed instant or an invented outcome. The answer carries no
     * score and no "healthy" flag: the log states its counts, and what they mean is the owner's to decide.
     */
    @Transactional(readOnly = true)
    public WebhookHealth healthOf(WebhookSubscription row) {
        String subscriber = row.getSubscriberAccountId();
        String webhookId = row.getWebhookId();
        long total = repository.countBySubscriberAccountIdAndWebhookId(subscriber, webhookId);
        long delivered = repository.countBySubscriberAccountIdAndWebhookIdAndOutcome(
                subscriber, webhookId, WebhookDispatcher.OUTCOME_DELIVERED);
        long refused = repository.countBySubscriberAccountIdAndWebhookIdAndOutcome(
                subscriber, webhookId, WebhookDispatcher.OUTCOME_REFUSED);
        long unreachable = repository.countBySubscriberAccountIdAndWebhookIdAndOutcome(
                subscriber, webhookId, WebhookDispatcher.OUTCOME_UNREACHABLE);
        Optional<WebhookDelivery> lastAttempt = repository
                .findFirstBySubscriberAccountIdAndWebhookIdOrderByAttemptedAtDescDeliveryIdDesc(
                        subscriber, webhookId);
        Optional<WebhookDelivery> lastDelivery = repository
                .findFirstBySubscriberAccountIdAndWebhookIdAndOutcomeOrderByAttemptedAtDescDeliveryIdDesc(
                        subscriber, webhookId, WebhookDispatcher.OUTCOME_DELIVERED);
        long sinceLastDelivery = lastDelivery
                .map(delivery -> repository.countBySubscriberAccountIdAndWebhookIdAndAttemptedAtGreaterThan(
                        subscriber, webhookId, delivery.getAttemptedAt()))
                .orElse(total);
        return new WebhookHealth(
                webhookId,
                subscriber,
                row.getEndpointUrl(),
                row.eventList(),
                row.getCreatedAt().toEpochMilli(),
                total,
                delivered,
                refused,
                unreachable,
                sinceLastDelivery,
                lastDelivery.map(delivery -> delivery.getAttemptedAt().toEpochMilli()).orElse(null),
                lastAttempt.map(delivery -> delivery.getAttemptedAt().toEpochMilli()).orElse(null),
                lastAttempt.map(WebhookDelivery::getOutcome).orElse(null),
                lastAttempt.map(WebhookDelivery::getStatus).orElse(null),
                lastAttempt.map(WebhookDelivery::getDetail).orElse(null));
    }
}
