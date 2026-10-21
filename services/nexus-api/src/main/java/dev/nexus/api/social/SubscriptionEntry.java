package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * M7 v300 — ONE subscription: a supporter backing a creator's plan.
 *
 * <p><b>The price is a SNAPSHOT.</b> The subscription records the plan's price, currency and period AS THEY
 * WERE when the subscription was made, and a later change to the plan does NOT rewrite them: what a
 * supporter agreed to is a fact about the past, and a fact about the past does not move. A subscription
 * that read the plan's CURRENT price would change its own history every time a creator changed their
 * prices.
 *
 * <p>The UNIQUE constraint on (subscriber, plan) is what makes "one subscription per supporter per plan"
 * the database's rule rather than the service's hope.
 */
@Entity
@Table(
        name = "subscription_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "subscription_entry_subscriber_plan",
                columnNames = {"subscriber_account_id", "plan_id"}))
public class SubscriptionEntry {

    /** The subscription's own id. */
    @Id
    @Column(name = "subscription_id", nullable = false, length = 64)
    private String subscriptionId;

    /** The account that backs the plan. */
    @Column(name = "subscriber_account_id", nullable = false, length = 200)
    private String subscriberAccountId;

    /** The account being backed — the plan's creator, copied so the relation survives the plan's retirement. */
    @Column(name = "creator_account_id", nullable = false, length = 200)
    private String creatorAccountId;

    /** The plan being backed. */
    @Column(name = "plan_id", nullable = false, length = 120)
    private String planId;

    /** The SNAPSHOT of the plan's price, in cents. */
    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    /** The SNAPSHOT of the plan's currency. */
    @Column(name = "currency", nullable = false, length = 8)
    private String currency;

    /** The SNAPSHOT of the plan's period. */
    @Column(name = "period", nullable = false, length = 16)
    private String period;

    /** When the subscription was made — the service's own instant. */
    @Column(name = "subscribed_at", nullable = false)
    private Instant subscribedAt;

    /**
     * When the subscription's PERIOD ends — computed ONCE from the plan's period.
     *
     * <p>Nothing renews it: there is no billing in this build (ADR 0018), so an expired subscription stays
     * expired until a new one is made. The bound is stated rather than implied.
     */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Whether the subscription is still standing. */
    @Column(name = "active", nullable = false)
    private boolean active;

    /**
     * v327 — the HANDLE the subscriber's claim carried, when it carried one. A name beside the id.
     *
     * <p>The follow row has kept the follower's handle since v288, and the trail names actors by id for the
     * same reason: an id is an address, and a name is what a person can read. A creator looking at the
     * subscriptions they received was looking at addresses — and the handle was in the claim all along.
     *
     * <p>It is NULLABLE on purpose: a claim that carried no handle leaves no name, and the panel then
     * shows the account id rather than inventing one.
     */
    @Column(name = "subscriber_handle", length = 64)
    private String subscriberHandle;

    /** v327 — the assurance the subscriber's claim carried, the same way the follow row keeps it. */
    @Column(name = "subscriber_assurance", length = 64)
    private String subscriberAssurance;

    /**
     * v328 — WHEN the subscription ended — the instant the supporter took it back.
     *
     * <p>Until now a row said THAT it ended (the `active` flag) and never WHEN: an expired subscription
     * knew its period's end, but a CANCELLED one knew only that it was over. A creator asking "who stopped
     * backing me, and when" had half an answer.
     *
     * <p>It is NULLABLE and stays null for a subscription that is still standing or that merely ran out of
     * its period: the cancellation is the one ending that has an instant of its own, and an expiry already
     * has one (`expiresAt`).
     */
    @Column(name = "ended_at")
    private Instant endedAt;

    protected SubscriptionEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public SubscriptionEntry(
            String subscriptionId,
            String subscriberAccountId,
            String creatorAccountId,
            String planId,
            long priceCents,
            String currency,
            String period,
            Instant subscribedAt,
            Instant expiresAt,
            boolean active) {
        this(subscriptionId, subscriberAccountId, creatorAccountId, planId, priceCents, currency, period,
                subscribedAt, expiresAt, active, null, null);
    }

    /**
     * v327 — the same subscription, and the NAME the subscriber's claim carried.
     *
     * <p>The overload without the name is kept: a row built without a claim (the tests do) has no name, and
     * that is the honest state of it.
     */
    public SubscriptionEntry(
            String subscriptionId,
            String subscriberAccountId,
            String creatorAccountId,
            String planId,
            long priceCents,
            String currency,
            String period,
            Instant subscribedAt,
            Instant expiresAt,
            boolean active,
            String subscriberHandle,
            String subscriberAssurance) {
        this(subscriptionId, subscriberAccountId, creatorAccountId, planId, priceCents, currency, period,
                subscribedAt, expiresAt, active, subscriberHandle, subscriberAssurance, null);
    }

    /**
     * v328 — the same subscription, and the instant it was taken back.
     */
    public SubscriptionEntry(
            String subscriptionId,
            String subscriberAccountId,
            String creatorAccountId,
            String planId,
            long priceCents,
            String currency,
            String period,
            Instant subscribedAt,
            Instant expiresAt,
            boolean active,
            String subscriberHandle,
            String subscriberAssurance,
            Instant endedAt) {
        this.subscriptionId = subscriptionId;
        this.subscriberAccountId = subscriberAccountId;
        this.creatorAccountId = creatorAccountId;
        this.planId = planId;
        this.priceCents = priceCents;
        this.currency = currency;
        this.period = period;
        this.subscribedAt = subscribedAt;
        this.expiresAt = expiresAt;
        this.active = active;
        this.subscriberHandle = subscriberHandle;
        this.subscriberAssurance = subscriberAssurance;
        this.endedAt = endedAt;
    }

    public String getSubscriptionId() {
        return subscriptionId;
    }

    public String getSubscriberAccountId() {
        return subscriberAccountId;
    }

    public String getCreatorAccountId() {
        return creatorAccountId;
    }

    public String getPlanId() {
        return planId;
    }

    public long getPriceCents() {
        return priceCents;
    }

    public String getCurrency() {
        return currency;
    }

    public String getPeriod() {
        return period;
    }

    public Instant getSubscribedAt() {
        return subscribedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isActive() {
        return active;
    }

    /** v327 — the handle the subscriber's claim carried, or null when it carried none. */
    public String getSubscriberHandle() {
        return subscriberHandle;
    }

    /** v327 — the assurance the subscriber's claim carried, or null when it carried none. */
    public String getSubscriberAssurance() {
        return subscriberAssurance;
    }

    /** v328 — the instant the subscription was taken back, or null when it was not. */
    public Instant getEndedAt() {
        return endedAt;
    }

    /** The subscription ends: the supporter cancelled, or its period ran out. */
    public void markEnded() {
        this.active = false;
    }

    /**
     * v328 — the subscription is TAKEN BACK, and the instant is written down.
     *
     * <p>The instant is the service's own clock: "when the supporter took it back" is a fact about the
     * service, and a fact about a machine is worth more than a fact about a browser.
     */
    public void markCancelled(Instant when) {
        this.active = false;
        this.endedAt = when;
    }
}
