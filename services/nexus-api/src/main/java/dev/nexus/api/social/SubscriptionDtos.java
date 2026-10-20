package dev.nexus.api.social;

import java.time.Instant;
import java.util.List;

/**
 * M7 v300 — the wire shapes for PLANS and SUBSCRIPTIONS.
 *
 * <p>The subscription itself is the CLIENT's own declared shape, field for field: `creatorId`,
 * `planId`, `priceCents`, `currency`, `active`, `subscribedAt` and `expiresAt`. The service sends the
 * subscriber, the subscription's own id and the creator's handle and assurance as well — the same rule
 * every social verb follows: the assurance travels with the actor.
 */
public final class SubscriptionDtos {

    private SubscriptionDtos() {
    }

    /** The currency a plan is priced in. CNY in this build. */
    public static final String CURRENCY_CNY = "CNY";

    /** The periods a plan may name: a CLOSED SET of three, so a reader can count by it. */
    public static final String PERIOD_ONCE = "once";
    public static final String PERIOD_MONTH = "month";
    public static final String PERIOD_YEAR = "year";

    /** WHO is acting. The shape is the one the Studio's own claim produces. */
    public record CreatorClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A plan request: which plan, at what price, for what period. */
    public record PlanRequest(String planId, long priceCents, String currency, String period, CreatorClaim claim) {
    }

    /** A subscription request: which plan, and who is subscribing. */
    public record SubscribeRequest(String planId, CreatorClaim claim) {
    }

    /** One plan, as a reader sees it. */
    public record Plan(
            String planId,
            String creatorId,
            long priceCents,
            String currency,
            String period,
            boolean active,
            long createdAt,
            String handle,
            String assurance) {
    }

    /** One subscription. The client's own `Subscription` shape, plus the fields the service knows. */
    public record Subscription(
            String creatorId,
            String planId,
            long priceCents,
            String currency,
            boolean active,
            long subscribedAt,
            Long expiresAt,
            String subscriberId,
            String id,
            String handle,
            String assurance) {
    }

    /** The answer to a plan question. */
    public record PlanAnswer(String creatorId, List<Plan> plans, int count, int limit) {
    }

    /**
     * The answer to a subscription question.
     *
     * <p>`totalCents` is what the subscriber has committed, summed by the DATABASE over the standing
     * subscriptions — a fact about the rows and not a running total the service kept in its head.
     */
    public record SubscriptionAnswer(String subscriberId, List<Subscription> subscriptions, long totalCents, int count, int limit) {
    }

    /** When a period ends, given the instant it started. The service computes it ONCE; nothing renews it. */
    static Instant expiryOf(Instant subscribedAt, String period) {
        return switch (period) {
            case PERIOD_MONTH -> subscribedAt.plus(java.time.Duration.ofDays(30));
            case PERIOD_YEAR -> subscribedAt.plus(java.time.Duration.ofDays(365));
            default -> null;
        };
    }
}
