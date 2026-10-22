package dev.nexus.api.social;

import dev.nexus.api.social.SubscriptionDtos.CreatorClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M7 v300 — PLANS and SUBSCRIPTIONS, as six rules.
 *
 * <p>A subscription is the one social act here that involves a PRICE and a TERM, and both are things a
 * service can get wrong in ways that read like facts.
 *
 * <ol>
 *   <li><b>A plan needs a CREATOR, a POSITIVE price, and a period from a closed set of three.</b> The plan
 *       is the creator's own claim about their own work; the service records it and verifies nothing
 *       (ADR 0018), and the assurance travels with it.
 *   <li><b>A subscription needs a SUBSCRIBER and a plan that exists and is still offered.</b>
 *   <li><b>An account cannot subscribe to its OWN plan</b> — a self-subscription is a no-op dressed as a
 *       relation, the same reason a self-follow is refused.
 *   <li><b>One subscription per supporter per plan.</b> The UNIQUE constraint is the database's rule, and
 *       the service asks the repository first so the refusal can be NAMED.
 *   <li><b>The price is a SNAPSHOT of the plan's price at the moment of subscribing.</b> A creator who
 *       raises their prices later does not rewrite what their supporters agreed to — what was agreed is a
 *       fact about the past, and a fact about the past does not move.
 *   <li><b>Only the subscriber can end their own subscription.</b>
 * </ol>
 *
 * <p><b>What this service does NOT do, stated rather than implied:</b> it moves no money and renews
 * nothing. There is no billing (ADR 0018), so a monthly subscription's expiry is computed ONCE and then
 * stands: nothing charges the supporter again and nothing extends it. The service records commitments,
 * not payments.
 */
@Service
public class SubscriptionService {

    /** Long enough for a real account id, short enough that it cannot be used to fill the table with one row. */
    static final int MAX_ACCOUNT_ID_LENGTH = 200;

    /** Long enough for a real plan id. */
    static final int MAX_PLAN_ID_LENGTH = 120;

    /** The most a plan may cost, in cents. */
    public static final long MAX_PRICE_CENTS = 1_000_000_00L;

    /** The most plans one answer may carry. The cap is CLAMPED rather than refused. */
    public static final int MAX_PLAN_LIMIT = 100;

    /** How many plans an answer carries when the caller names no limit. */
    public static final int DEFAULT_PLAN_LIMIT = 20;

    /** The most subscriptions one answer may carry. */
    public static final int MAX_SUBSCRIPTION_LIMIT = 100;

    /** How many subscriptions an answer carries when the caller names no limit. */
    public static final int DEFAULT_SUBSCRIPTION_LIMIT = 20;

    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final Clock clock;

    public SubscriptionService(PlanRepository plans, SubscriptionRepository subscriptions, Clock clock) {
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.clock = clock;
    }

    /**
     * OFFER a plan.
     *
     * @throws InvalidSubscription when a rule is broken
     */
    @Transactional
    public PlanEntry offer(String planId, long priceCents, String currency, String period, CreatorClaim claim) {
        String id = requirePlanId(planId);
        String creator = requireAccount(claim == null ? null : claim.accountId(), "a plan needs an account to offer it");
        long price = requirePrice(priceCents);
        String term = requirePeriod(period);
        Optional<PlanEntry> existing = plans.findByPlanId(id);
        if (existing.isPresent()) {
            throw new InvalidSubscription(
                    "a plan with this id already exists; a plan is an ADDRESS and a second one would make it ambiguous");
        }
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        PlanEntry row = new PlanEntry(
                id,
                creator,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                price,
                currency == null || currency.isBlank() ? SubscriptionDtos.CURRENCY_CNY : currency.trim(),
                term,
                true,
                when);
        return plans.save(row);
    }

    /**
     * BACK a plan.
     *
     * @throws InvalidSubscription when a rule is broken
     */
    @Transactional
    public SubscriptionEntry subscribe(String planId, CreatorClaim claim) {
        String subscriber = requireAccount(claim == null ? null : claim.accountId(), "a subscription needs an account to hold it");
        if (planId == null || planId.isBlank()) {
            throw new InvalidSubscription("a subscription needs a plan");
        }
        String plan = planId.trim();
        Optional<PlanEntry> found = plans.findByPlanId(plan);
        if (found.isEmpty()) {
            throw new InvalidSubscription("there is no plan with this id");
        }
        PlanEntry offered = found.get();
        if (!offered.isActive()) {
            throw new InvalidSubscription("this plan is not offered any more");
        }
        if (offered.getCreatorAccountId().equals(subscriber)) {
            throw new InvalidSubscription("an account cannot subscribe to its own plan: that is not a relation, it is a no-op");
        }
        Optional<SubscriptionEntry> existing = subscriptions.findBySubscriberAccountIdAndPlanId(subscriber, plan);
        if (existing.isPresent()) {
            // v313 — the two cases are DIFFERENT facts, and one refusal for both of them is a lie.
            //
            // A subscription that is still standing → this account already backs this plan (true).
            //
            // A subscription that has ENDED → this account does NOT back this plan any more, and the
            // refusal says so, with the rule that makes it permanent and the way out of it. The uniqueness
            // rule is the DATABASE's (one subscription per supporter per plan), so it cannot be renewed
            // without a schema change — and this build has no migration tool (the service's own README says
            // so). Saying "this account already backs this plan" about a subscription that ended months ago
            // would be the kind of small untrue thing that sends a reader looking for a subscription that is
            // not there.
            SubscriptionEntry previous = existing.get();
            String standing = standingOf(previous);
            if (SubscriptionDtos.STATUS_ACTIVE.equals(standing)) {
                throw new InvalidSubscription("this account already backs this plan");
            }
            if (SubscriptionDtos.STATUS_CANCELLED.equals(standing)) {
                throw new InvalidSubscription(
                        "this account cancelled this subscription, and it cannot be made again: "
                                + "one subscription per supporter per plan is the DATABASE's rule");
            }
            throw new InvalidSubscription(
                    "this account's subscription to this plan ended on "
                            + previous.getExpiresAt()
                            + ", and this build cannot renew it: one subscription per supporter per plan is the "
                            + "DATABASE's rule, and there is no billing to renew it with. A creator can offer a "
                            + "NEW plan, and the subscription would be made against that.");
        }
        Instant when = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        // The SNAPSHOT: the plan's price, currency and period AS THEY ARE NOW. A later change to the plan
        // does not rewrite what the supporter agreed to.
        // v327 — the NAME the subscriber's claim carried goes on the row, so a creator reading
        // the subscriptions they received sees a person and not an address. A claim that carried no
        // handle leaves no name: the panel then shows the account id rather than inventing one.
        SubscriptionEntry row = new SubscriptionEntry(
                UUID.randomUUID().toString(),
                subscriber,
                offered.getCreatorAccountId(),
                offered.getPlanId(),
                offered.getPriceCents(),
                offered.getCurrency(),
                offered.getPeriod(),
                when,
                SubscriptionDtos.expiryOf(when, offered.getPeriod()),
                true,
                claim == null ? null : claim.handle(),
                claim == null ? null : claim.assurance(),
                // v330 — the plan's creator's NAME, copied like the price: what a supporter agreed to is a
                // fact about the past, and a plan id is an address rather than a name.
                offered.getCreatorHandle(),
                // v328 — a new subscription has no ending: it has not been taken back yet.
                null);
        return subscriptions.save(row);
    }

    /**
     * v308 — WHERE a subscription STANDS, computed rather than remembered.
     *
     * <p>The row carries a flag that says the supporter has not cancelled — a fact about the past, and one
     * that never goes stale. What it cannot say is whether the subscription is still standing, because its
     * PERIOD runs out on a day when nothing writes to the row. So the standing is computed here, from the
     * row and the clock:
     *
     * <ul>
     *   <li>`cancelled` — the supporter ended it.
     *   <li>`expired` — the period ran out.
     *   <li>`active` — it is still standing.
     * </ul>
     *
     * <p>Nothing renews an expired subscription: there is no billing in this build (ADR 0018), so an expired
     * subscription stays expired until a NEW one is made — and a new one cannot be made for the same plan,
     * because one subscription per supporter per plan is the database's rule. The bound is stated rather
     * than implied.
     */
    public String standingOf(SubscriptionEntry row) {
        if (!row.isActive()) {
            return SubscriptionDtos.STATUS_CANCELLED;
        }
        Instant expiry = row.getExpiresAt();
        if (expiry != null && !clock.instant().isBefore(expiry)) {
            return SubscriptionDtos.STATUS_EXPIRED;
        }
        return SubscriptionDtos.STATUS_ACTIVE;
    }

    /**
     * END a subscription — and only the subscriber's own.
     */
    @Transactional
    public boolean cancel(String subscriptionId, CreatorClaim claim) {
        String subscriber = requireAccount(claim == null ? null : claim.accountId(), "a subscription needs an account to hold it");
        if (subscriptionId == null || subscriptionId.isBlank()) {
            throw new InvalidSubscription("subscriptionId must not be blank");
        }
        Optional<SubscriptionEntry> found = subscriptions.findBySubscriptionId(subscriptionId.trim());
        if (found.isEmpty()) {
            return false;
        }
        SubscriptionEntry row = found.get();
        if (!row.getSubscriberAccountId().equals(subscriber)) {
            throw new InvalidSubscription("this subscription was made by another account, and only its holder may end it");
        }
        if (!row.isActive()) {
            return false;
        }
        // v328 — the instant the supporter took it back is written down. A row that said THAT
        // it ended and never WHEN left a creator asking "who stopped, and when" with half an answer.
        row.markCancelled(clock.instant().truncatedTo(ChronoUnit.MILLIS));
        subscriptions.save(row);
        return true;
    }

    /**
     * v317 — CHANGE the price of a plan — and only the creator's own.
     *
     * <p>The subscriptions already made against the plan keep the price they were made at (the SNAPSHOT,
     * v300), and the new price is what the NEXT subscriber agrees to. The creator may not change what a
     * supporter already agreed to, and the service does not let them: there is nothing here that touches a
     * subscription row.
     *
     * <p>A plan that is RETIRED may be repriced — but it stays retired. Retiring is one-way (v314), and a
     * price change is not a way back.
     */
    @Transactional
    public PlanEntry reprice(String planId, long priceCents, String period, CreatorClaim claim) {
        String creator = requireAccount(claim == null ? null : claim.accountId(), "a plan needs an account to offer it");
        if (planId == null || planId.isBlank()) {
            throw new InvalidSubscription("planId must not be blank");
        }
        Optional<PlanEntry> found = plans.findByPlanId(planId.trim());
        if (found.isEmpty()) {
            throw new InvalidSubscription("there is no plan with this id");
        }
        PlanEntry row = found.get();
        if (!row.getCreatorAccountId().equals(creator)) {
            throw new NotYourPlan(
                    "this plan was offered by another account, and only the account that offers it may change its price");
        }
        if (priceCents <= 0) {
            throw new InvalidSubscription("a plan's price must be positive, got " + priceCents);
        }
        if (priceCents > MAX_PRICE_CENTS) {
            throw new InvalidSubscription("a plan's price must be at most " + MAX_PRICE_CENTS + " cents, got " + priceCents);
        }
        String wanted = requirePeriod(period);
        row.reprice(priceCents, wanted);
        return plans.save(row);
    }

    /**
     * v314 — RETIRE a plan — and only the creator's own.
     *
     * <p>Retiring takes the OFFER away: nobody new can back the plan, and the service already refuses a
     * subscription to a plan that is not offered any more. It does NOT touch the subscriptions already made
     * against it: a supporter who backed the plan for a month was promised that month, and a creator
     * changing their mind about the offer does not take the promise with it.
     *
     * <p>A plan that is already retired is "already retired", not a failure — the same rule the
     * subscription's ending follows.
     */
    @Transactional
    public boolean retire(String planId, CreatorClaim claim) {
        String creator = requireAccount(claim == null ? null : claim.accountId(), "a plan needs an account to offer it");
        if (planId == null || planId.isBlank()) {
            throw new InvalidSubscription("planId must not be blank");
        }
        Optional<PlanEntry> found = plans.findByPlanId(planId.trim());
        if (found.isEmpty()) {
            return false;
        }
        PlanEntry row = found.get();
        if (!row.getCreatorAccountId().equals(creator)) {
            throw new NotYourPlan(
                    "this plan was offered by another account, and only the account that offers it may retire it");
        }
        if (!row.isActive()) {
            return false;
        }
        row.markRetired();
        plans.save(row);
        return true;
    }

    /** The plans one creator offers. */
    @Transactional(readOnly = true)
    public List<PlanEntry> plansOf(String creatorAccountId, int limit) {
        String creator = requireAccount(creatorAccountId, "a plan needs an account to offer it");
        int asked = limit <= 0 ? DEFAULT_PLAN_LIMIT : Math.min(limit, MAX_PLAN_LIMIT);
        return plans.findByCreatorAccountIdOrderByCreatedAtDesc(creator, PageRequest.of(0, asked));
    }

    /** The subscriptions one account holds. */
    @Transactional(readOnly = true)
    public List<SubscriptionEntry> subscriptionsOf(String subscriberAccountId, int limit) {
        String subscriber = requireAccount(subscriberAccountId, "a subscription needs an account to hold it");
        int asked = limit <= 0 ? DEFAULT_SUBSCRIPTION_LIMIT : Math.min(limit, MAX_SUBSCRIPTION_LIMIT);
        return subscriptions.findBySubscriberAccountIdOrderBySubscribedAtDesc(subscriber, PageRequest.of(0, asked));
    }

    /**
     * v359 — how many subscriptions one account HOLDS, over the whole table.
     *
     * <p>The count is the DATABASE’s count, so a panel that shows a list of them can also say how many
     * there are and whether the list is a window.
     */
    @Transactional(readOnly = true)
    public long countHeld(String subscriberAccountId) {
        String subscriber = requireAccount(subscriberAccountId, "a subscription needs an account to hold it");
        return subscriptions.countBySubscriberAccountId(subscriber);
    }

    /**
     * v359 — how many subscriptions one account RECEIVED, over the whole table.
     */
    @Transactional(readOnly = true)
    public long countReceived(String creatorAccountId) {
        String creator = requireAccount(creatorAccountId, "a plan needs an account to offer it");
        return subscriptions.countByCreatorAccountId(creator);
    }

    /**
     * v359 — how much one account HOLDS, over the whole table, standing rows only.
     */
    @Transactional(readOnly = true)
    public long totalHeld(String subscriberAccountId) {
        String subscriber = requireAccount(subscriberAccountId, "a subscription needs an account to hold it");
        return subscriptions.sumStandingPriceCentsBySubscriberAccountId(subscriber, clock.instant());
    }

    /**
     * v359 — how much one account RECEIVED, over the whole table, standing rows only.
     */
    @Transactional(readOnly = true)
    public long totalReceived(String creatorAccountId) {
        String creator = requireAccount(creatorAccountId, "a plan needs an account to offer it");
        return subscriptions.sumStandingPriceCentsByCreatorAccountId(creator, clock.instant());
    }

    /**
     * v368 — what the subscriptions one account HOLDS come to, PER PERIOD.
     *
     * <p>The periods are a CLOSED set and the answer is ordered the way a person would say them: one
     * time · month · year.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionDtos.PeriodTotal> totalsHeld(String subscriberAccountId) {
        String subscriber = requireAccount(subscriberAccountId, "a subscription needs an account to hold it");
        return periodTotals(subscriptions.sumStandingPriceCentsByPeriodHeld(subscriber, clock.instant()));
    }

    /**
     * v368 — and what the subscriptions one account RECEIVED come to, per period.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionDtos.PeriodTotal> totalsReceived(String creatorAccountId) {
        String creator = requireAccount(creatorAccountId, "a plan needs an account to offer it");
        return periodTotals(subscriptions.sumStandingPriceCentsByPeriodReceived(creator, clock.instant()));
    }

    /**
     * The groups, in the order a person would say the periods.
     *
     * <p>v369 — a group carries its CURRENCY as well as its period: money in two currencies does not add up
     * to one number, and a total that added them would be a number nobody could act on.
     */
    private static List<SubscriptionDtos.PeriodTotal> periodTotals(List<Object[]> groups) {
        List<SubscriptionDtos.PeriodTotal> totals = new java.util.ArrayList<>();
        for (Object[] group : groups) {
            if (group == null || group.length < 3) {
                continue;
            }
            String period = group[0] == null ? "" : String.valueOf(group[0]);
            String currency = group[1] == null ? "" : String.valueOf(group[1]);
            long cents = group[2] instanceof Number number ? number.longValue() : 0L;
            totals.add(new SubscriptionDtos.PeriodTotal(period, currency, cents));
        }
        totals.sort(java.util.Comparator
                .comparingInt((SubscriptionDtos.PeriodTotal total) -> periodOrder(total.period()))
                .thenComparing(SubscriptionDtos.PeriodTotal::currency));
        return totals;
    }

    /** once → month → year, and anything unknown after them. */
    private static int periodOrder(String period) {
        return switch (period) {
            case SubscriptionDtos.PERIOD_ONCE -> 0;
            case SubscriptionDtos.PERIOD_MONTH -> 1;
            case SubscriptionDtos.PERIOD_YEAR -> 2;
            default -> 3;
        };
    }

    /** The subscriptions one creator received, and how many are standing. */
    @Transactional(readOnly = true)
    public List<SubscriptionEntry> subscriptionsReceived(String creatorAccountId, int limit) {
        String creator = requireAccount(creatorAccountId, "a plan needs an account to offer it");
        int asked = limit <= 0 ? DEFAULT_SUBSCRIPTION_LIMIT : Math.min(limit, MAX_SUBSCRIPTION_LIMIT);
        return subscriptions.findByCreatorAccountIdOrderBySubscribedAtDesc(creator, PageRequest.of(0, asked));
    }

    private static String requirePlanId(String planId) {
        if (planId == null || planId.isBlank()) {
            throw new InvalidSubscription("a plan needs an id: it is an address people are given");
        }
        String trimmed = planId.trim();
        if (trimmed.length() > MAX_PLAN_ID_LENGTH) {
            throw new InvalidSubscription("planId must be at most " + MAX_PLAN_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    private static String requireAccount(String accountId, String because) {
        if (accountId == null || accountId.isBlank()) {
            throw new InvalidSubscription(because);
        }
        String trimmed = accountId.trim();
        if (trimmed.length() > MAX_ACCOUNT_ID_LENGTH) {
            throw new InvalidSubscription("accountId must be at most " + MAX_ACCOUNT_ID_LENGTH + " characters, got " + trimmed.length());
        }
        return trimmed;
    }

    /** The price is POSITIVE and CAPPED, and each refusal says WHICH. */
    private static long requirePrice(long priceCents) {
        if (priceCents == 0) {
            throw new InvalidSubscription("a plan cannot be free: a price of zero is not a price, it is the absence of one");
        }
        if (priceCents < 0) {
            throw new InvalidSubscription("a plan's price cannot be negative");
        }
        if (priceCents > MAX_PRICE_CENTS) {
            throw new InvalidSubscription("a plan must be at most " + MAX_PRICE_CENTS + " cents, got " + priceCents);
        }
        return priceCents;
    }

    /** The period is one of three, and the refusal NAMES them. */
    private static String requirePeriod(String period) {
        if (period == null || period.isBlank()) {
            throw new InvalidSubscription(
                    "a plan needs a period: one of " + SubscriptionDtos.PERIOD_ONCE + ", " + SubscriptionDtos.PERIOD_MONTH + ", " + SubscriptionDtos.PERIOD_YEAR);
        }
        String trimmed = period.trim();
        switch (trimmed) {
            case SubscriptionDtos.PERIOD_ONCE:
            case SubscriptionDtos.PERIOD_MONTH:
            case SubscriptionDtos.PERIOD_YEAR:
                return trimmed;
            default:
                throw new InvalidSubscription(
                        "a plan's period is one of " + SubscriptionDtos.PERIOD_ONCE + ", " + SubscriptionDtos.PERIOD_MONTH + ", " + SubscriptionDtos.PERIOD_YEAR + " — got " + trimmed);
        }
    }
}
