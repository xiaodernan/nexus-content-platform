package dev.nexus.api.webhooks;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v560 — ONE delivery attempt, written down: what this service tried to tell whom, and what happened.
 *
 * <p>Until this slice a delivery was a VALUE returned to whoever asked for it and then forgotten: the fan-out
 * answer went to a listener nobody was listening to, and a subscriber that was down when an event happened had
 * no way to learn it had missed one. This row is that answer made durable — one per ATTEMPT, not per event,
 * so "the endpoint refused it at 09:00 and accepted the ping at 10:00" is two rows rather than one overwritten
 * fact.
 *
 * <p>Three fields are deliberately carried rather than joined:
 *
 * <ul>
 *   <li>The SUBSCRIBER, because the read door is the owner's question ("what happened to MY endpoints?") and a
 *       join back to the subscription would answer nothing once the row is removed.
 *   <li>The EVENT and the TARGET, because that is what the subscriber was told: a receipt that named only its
 *       own id would make the reader join the trail to find out what it was about, and the trail can be
 *       pruned while a receipt should say what it said.
 *   <li>Both INSTANTS: when the thing happened ({@code eventAt}) and when this service knocked
 *       ({@code attemptedAt}). A ping has the same instant twice; a fan-out runs after the commit, so the two
 *       can differ by however long the endpoint took.
 * </ul>
 *
 * <p>Nothing here deletes a row: the table only grows (the same honest bound the audit trail states). A
 * retention rule — how long a subscriber's receipts are kept — is a later decision, and it is not implied by
 * this schema.
 */
@Entity
@Table(name = "webhook_delivery")
public class WebhookDelivery {

    /** The attempt's own id, newest-first tie-break included. */
    @Id
    @Column(name = "delivery_id", nullable = false, length = 64)
    private String deliveryId;

    /** The subscription that was attempted — its id, even if the row is removed later. */
    @Column(name = "webhook_id", nullable = false, length = 64)
    private String webhookId;

    /** The account the subscription belonged to — the read door's key. */
    @Column(name = "subscriber_account_id", nullable = false, length = 200)
    private String subscriberAccountId;

    /** The verb that was delivered: a trail verb, or {@code ping} for an on-demand call. */
    @Column(name = "event", nullable = false, length = 32)
    private String event;

    /** The id of the thing the event happened to. */
    @Column(name = "target_id", nullable = false, length = 200)
    private String targetId;

    /** {@code delivered}, {@code refused} or {@code unreachable} — the dispatcher's own three outcomes. */
    @Column(name = "outcome", nullable = false, length = 16)
    private String outcome;

    /** The endpoint's status when it answered; null when nothing answered or nothing was sent. */
    @Column(name = "status")
    private Integer status;

    /** Why: a refusal's {@code status}, a private address, or the exception's simple name. Null when delivered. */
    @Column(name = "detail", length = 100)
    private String detail;

    /** When the fact happened, as the event carried it. */
    @Column(name = "event_at", nullable = false)
    private Instant eventAt;

    /** When this service attempted the POST. */
    @Column(name = "attempted_at", nullable = false)
    private Instant attemptedAt;

    protected WebhookDelivery() {
        // JPA needs it; the log never builds one without values.
    }

    public WebhookDelivery(
            String deliveryId,
            String webhookId,
            String subscriberAccountId,
            String event,
            String targetId,
            String outcome,
            Integer status,
            String detail,
            Instant eventAt,
            Instant attemptedAt) {
        this.deliveryId = deliveryId;
        this.webhookId = webhookId;
        this.subscriberAccountId = subscriberAccountId;
        this.event = event;
        this.targetId = targetId;
        this.outcome = outcome;
        this.status = status;
        this.detail = detail;
        this.eventAt = eventAt;
        this.attemptedAt = attemptedAt;
    }

    public String getDeliveryId() {
        return deliveryId;
    }

    public String getWebhookId() {
        return webhookId;
    }

    public String getSubscriberAccountId() {
        return subscriberAccountId;
    }

    public String getEvent() {
        return event;
    }

    public String getTargetId() {
        return targetId;
    }

    public String getOutcome() {
        return outcome;
    }

    public Integer getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getEventAt() {
        return eventAt;
    }

    public Instant getAttemptedAt() {
        return attemptedAt;
    }
}
