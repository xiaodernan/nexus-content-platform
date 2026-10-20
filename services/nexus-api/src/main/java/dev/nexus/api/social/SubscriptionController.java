package dev.nexus.api.social;

import dev.nexus.api.social.SubscriptionDtos.CreatorClaim;
import dev.nexus.api.social.SubscriptionDtos.Plan;
import dev.nexus.api.social.SubscriptionDtos.PlanAnswer;
import dev.nexus.api.social.SubscriptionDtos.PlanRequest;
import dev.nexus.api.social.SubscriptionDtos.SubscribeRequest;
import dev.nexus.api.social.SubscriptionDtos.Subscription;
import dev.nexus.api.social.SubscriptionDtos.SubscriptionAnswer;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M7 v300 — the HTTP surface for PLANS and SUBSCRIPTIONS.
 *
 * <p>Four doors, and the difference between them is the difference between the rules:
 *
 * <ul>
 *   <li>{@code POST /plans} — offer a plan (the creator's claim about their own work).
 *   <li>{@code GET /plans?creator=} — the plans one creator offers.
 *   <li>{@code POST /subscriptions} — back a plan.
 *   <li>{@code GET /subscriptions?subscriber=} — the subscriptions one account holds.
 * </ul>
 *
 * <p>The refusals are translated into the status codes that carry the difference — 400 for a request that
 * broke a rule, and nothing else.
 */
@RestController
@RequestMapping("/")
public class SubscriptionController {

    private final SubscriptionService service;

    public SubscriptionController(SubscriptionService service) {
        this.service = service;
    }

    /** Offer a plan. 201 when it was created. */
    @PostMapping("/plans")
    public ResponseEntity<PlanAnswer> offer(@RequestBody PlanRequest request) {
        PlanEntry row = service.offer(
                request == null ? null : request.planId(),
                request == null ? 0L : request.priceCents(),
                request == null ? null : request.currency(),
                request == null ? null : request.period(),
                request == null ? null : request.claim());
        return ResponseEntity.status(201).body(new PlanAnswer(
                row.getCreatorAccountId(),
                List.of(toWire(row)),
                1,
                SubscriptionService.DEFAULT_PLAN_LIMIT));
    }

    /** The plans one creator offers. */
    @GetMapping("/plans")
    public ResponseEntity<PlanAnswer> plans(
            @RequestParam(name = "creator") String creatorAccountId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? SubscriptionService.DEFAULT_PLAN_LIMIT : limit;
        List<PlanEntry> rows = service.plansOf(creatorAccountId, asked);
        List<Plan> plans = rows.stream().map(SubscriptionController::toWire).toList();
        return ResponseEntity.ok(new PlanAnswer(creatorAccountId, plans, plans.size(), asked));
    }

    /** Back a plan. 201 when the subscription was made. */
    @PostMapping("/subscriptions")
    public ResponseEntity<SubscriptionAnswer> subscribe(@RequestBody SubscribeRequest request) {
        SubscriptionEntry row = service.subscribe(
                request == null ? null : request.planId(),
                request == null ? null : request.claim());
        return ResponseEntity.status(201).body(new SubscriptionAnswer(
                row.getSubscriberAccountId(),
                List.of(toWire(row)),
                row.getPriceCents(),
                1,
                SubscriptionService.DEFAULT_SUBSCRIPTION_LIMIT));
    }

    /** The subscriptions one account holds. */
    @GetMapping("/subscriptions")
    public ResponseEntity<SubscriptionAnswer> subscriptions(
            @RequestParam(name = "subscriber") String subscriberAccountId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? SubscriptionService.DEFAULT_SUBSCRIPTION_LIMIT : limit;
        List<SubscriptionEntry> rows = service.subscriptionsOf(subscriberAccountId, asked);
        List<Subscription> subs = rows.stream().map(this::toWire).toList();
        // v308 — the total counts the subscriptions that are STILL STANDING. An expired subscription is not
        // a commitment any more, and counting it would say the subscriber is backing a plan whose period has
        // run out.
        long total = subs.stream()
                .filter(s -> SubscriptionDtos.STATUS_ACTIVE.equals(s.status()))
                .mapToLong(Subscription::priceCents)
                .sum();
        return ResponseEntity.ok(new SubscriptionAnswer(subscriberAccountId, subs, total, subs.size(), asked));
    }

    /** End a subscription. 200 either way: a subscription that is already gone is "already gone". */
    @DeleteMapping("/subscriptions/{subscriptionId}")
    public ResponseEntity<Map<String, Object>> cancel(
            @PathVariable String subscriptionId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        CreatorClaim claim = claimerAccountId == null ? null : new CreatorClaim(claimerAccountId, null, null, null);
        boolean ended = service.cancel(subscriptionId, claim);
        return ResponseEntity.ok(Map.of("ok", true, "subscriptionId", subscriptionId, "ended", ended));
    }

    private static Plan toWire(PlanEntry row) {
        return new Plan(
                row.getPlanId(),
                row.getCreatorAccountId(),
                row.getPriceCents(),
                row.getCurrency(),
                row.getPeriod(),
                row.isActive(),
                row.getCreatedAt().toEpochMilli(),
                row.getCreatorHandle(),
                row.getCreatorAssurance());
    }

    /**
     * The service's row, as the wire's shape — with the standing the service COMPUTED (v308).
     */
    private Subscription toWire(SubscriptionEntry row) {
        return new Subscription(
                row.getCreatorAccountId(),
                row.getPlanId(),
                row.getPriceCents(),
                row.getCurrency(),
                row.isActive(),
                row.getSubscribedAt().toEpochMilli(),
                row.getExpiresAt() == null ? null : row.getExpiresAt().toEpochMilli(),
                row.getSubscriberAccountId(),
                row.getSubscriptionId(),
                null,
                null,
                // v308 — where the subscription STANDS, computed by the service from the row and the clock.
                service.standingOf(row));
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidSubscription.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidSubscription e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-subscription", "message", e.getMessage()));
    }
}
