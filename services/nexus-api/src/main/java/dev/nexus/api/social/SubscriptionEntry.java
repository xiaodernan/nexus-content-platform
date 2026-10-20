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

    /** The subscription ends: the supporter cancelled, or its period ran out. */
    public void markEnded() {
        this.active = false;
    }
}
