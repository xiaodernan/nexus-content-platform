package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M7 v300 — ONE plan: a creator offering a subscription at a price.
 *
 * <p>The plan is the CREATOR's own claim about their own work: what it costs, in what currency, and for
 * how long. The service records it and verifies nothing (ADR 0018) — and the ASSURANCE travels with it
 * so a reader is told what the price is worth.
 *
 * <p>The plan is the reason a subscription's price can be SNAPSHOTTED rather than claimed by whoever
 * subscribes: the price comes from the creator's plan, and the subscriber names only the plan.
 */
@Entity
@Table(name = "plan_entry")
public class PlanEntry {

    /** The plan's own id. The creator names it — it is an ADDRESS they give people. */
    @Id
    @Column(name = "plan_id", nullable = false, length = 120)
    private String planId;

    /** The account that offers the plan — the creator. */
    @Column(name = "creator_account_id", nullable = false, length = 200)
    private String creatorAccountId;

    /** The handle the creator's claim carried, when it carried one. */
    @Column(name = "creator_handle", length = 24)
    private String creatorHandle;

    /** What the creator's claim was worth when it arrived. */
    @Column(name = "creator_assurance", length = 32)
    private String creatorAssurance;

    /** The price, in CENTS. Never zero, never negative, never absurd. */
    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    /** The currency of the price. CNY in this build. */
    @Column(name = "currency", nullable = false, length = 8)
    private String currency;

    /** The period: once, month or year. A CLOSED SET, so a reader can count by it. */
    @Column(name = "period", nullable = false, length = 16)
    private String period;

    /** Whether the plan is offered right now. A plan can be retired without deleting what it was sold for. */
    @Column(name = "active", nullable = false)
    private boolean active;

    /** When the plan was created — the service's own instant. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PlanEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public PlanEntry(
            String planId,
            String creatorAccountId,
            String creatorHandle,
            String creatorAssurance,
            long priceCents,
            String currency,
            String period,
            boolean active,
            Instant createdAt) {
        this.planId = planId;
        this.creatorAccountId = creatorAccountId;
        this.creatorHandle = creatorHandle;
        this.creatorAssurance = creatorAssurance;
        this.priceCents = priceCents;
        this.currency = currency;
        this.period = period;
        this.active = active;
        this.createdAt = createdAt;
    }

    public String getPlanId() {
        return planId;
    }

    public String getCreatorAccountId() {
        return creatorAccountId;
    }

    public String getCreatorHandle() {
        return creatorHandle;
    }

    public String getCreatorAssurance() {
        return creatorAssurance;
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

    /**
     * v314 — the creator retires their own plan.
     *
     * <p>Retiring stops the OFFER, not the promises: the subscriptions already made against the plan stay
     * where they are, because a supporter who backed a plan for a month was promised that month — and
     * taking the offer away does not take the promise with it.
     */
    public void markRetired() {
        this.active = false;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
