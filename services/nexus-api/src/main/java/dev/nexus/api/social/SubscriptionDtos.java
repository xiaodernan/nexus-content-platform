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

    /**
     * v308 — the standing of a subscription, COMPUTED at read time.
     *
     * <p>A subscription that is stored as "active" is not necessarily still standing: its PERIOD ran out
     * while nothing wrote to the row. The stored flag says the supporter has not CANCELLED — a fact about
     * the past, which never goes stale — and these three say where the subscription stands NOW.
     */
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_EXPIRED = "expired";
    public static final String STATUS_CANCELLED = "cancelled";

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

    /**
     * One subscription. The client's own `Subscription` shape, plus the fields the service knows.
     *
     * <p><b>v308 — and the `status`, which is the truth NOW.</b> `active` is what the ROW says (the supporter
     * has not cancelled — a fact about the past); `status` is what the service COMPUTES from the row and the
     * clock (whether the subscription is still standing, and if not, whether it expired or was cancelled).
     * A row that says "active" and an expiry that has passed are both true, and only one of them is the
     * standing of the subscription.
     */
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
            String assurance,
            String status,
            /**
             * v328 — WHEN the subscription was taken back, in epoch millis. Null when it was not taken
             * back: a standing subscription has no ending, and one that merely ran out of its period ended
             * on `expiresAt`, which is a different date.
             */
            Long endedAt,
            /**
             * v330 — the plan's creator's NAME, as it was when the subscription was made. Null when the
             * plan carried no name: the panel then shows the creator's account id rather than inventing one.
             */
            String creatorHandle,
            /**
             * v367 — the PERIOD this subscription is for, as it was when it was made.
             *
             * <p>The row has kept the plan's period as a SNAPSHOT since v300 — next to the price — and the
             * wire never carried it, so a reader saw "¥15.00" and could not tell a monthly pledge from
             * a yearly one. The plan's own period can change (v317 reprices a plan, period and all), and
             * this is the one that was agreed.
             */
            String period) {
    }

    /**
     * v368 — what one period comes to.
     *
     * <p>The period is the service's own word ("once" · "month" · "year"), and the amount is in cents.
     */
    public record PeriodTotal(String period, long totalCents) {
    }

    /** The answer to a plan question. */
    public record PlanAnswer(String creatorId, List<Plan> plans, int count, int limit) {
    }

    /**
     * v310 — the answer to a CREATOR's question: the subscriptions they have RECEIVED.
     *
     * <p>The rows are the SAME subscription shape the subscriber's direction carries, so a client reads one
     * shape whichever door it came through; and the answer names the CREATOR in its own field, because a
     * list of somebody's supporters is a list of their own.
     */
    /** v359 — and the same: the count is the whole table’s, in both directions. */
    public record ReceivedSubscriptionsAnswer(
            String creatorId,
            List<Subscription> subscriptions,
            /**
             * v368 — the totals, PER PERIOD.
             *
             * <p>A single sum over subscriptions of different periods is a meaningless number — a monthly
             * pledge and a yearly one do not add up to anything a reader can act on — so the answer says
             * what is owed for each period instead.
             */
            java.util.List<PeriodTotal> totalsByPeriod,
            long count,
            int limit) {
    }

    /**
     * The answer to a subscription question.
     *
     * <p>v308 — `totalCents` is what the subscriber has committed, summed over the subscriptions that are
     * STILL STANDING. An expired subscription is not a commitment any more — counting it would say the
     * subscriber is backing a plan whose period has run out. The sum is the SERVICE's (the standing is
     * computed, so the database cannot sum it), and it is a fact about the rows and not a running total the
     * service kept in its head.
     */
    /**
     * v359 — the count is the WHOLE table’s, in both directions.
     *
     * <p>It was the number of rows the service happened to read — the WINDOW’s size — dressed as a
     * total. A panel that shows a list of subscriptions can now say how many there are and whether the
     * list is a window.
     */
    public record SubscriptionAnswer(
            String subscriberId,
            List<Subscription> subscriptions,
            /** v368 — and the same: the totals, per period. */
            java.util.List<PeriodTotal> totalsByPeriod,
            long count,
            int limit) {
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
