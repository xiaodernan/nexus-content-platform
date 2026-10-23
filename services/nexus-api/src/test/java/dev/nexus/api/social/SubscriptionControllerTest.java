package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.SubscriptionDtos.CreatorClaim;
import dev.nexus.api.social.SubscriptionDtos.PeriodTotal;
import dev.nexus.api.social.SubscriptionDtos.Plan;
import dev.nexus.api.social.SubscriptionDtos.PlanAnswer;
import dev.nexus.api.social.SubscriptionDtos.PlanRequest;
import dev.nexus.api.social.SubscriptionDtos.ReceivedSubscriptionsAnswer;
import dev.nexus.api.social.SubscriptionDtos.SubscribeRequest;
import dev.nexus.api.social.SubscriptionDtos.Subscription;
import dev.nexus.api.social.SubscriptionDtos.SubscriptionAnswer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M7 v423 - the HTTP surface for PLANS and SUBSCRIPTIONS, graded directly.
 *
 * <p>The biggest door of them all: offer a plan, list a creator's plans, back a plan, list the
 * subscriptions one account holds or one creator received, retire a plan, end a subscription, reprice a
 * plan. What THIS file grades is the controller's own decisions: every write answers 201 or 200 with the
 * shape it ships, the claim every DELETE and PUT builds out of a query parameter carries the account id
 * and nothing else, the two read directions ask the service with the RAW cap (one clamp, in the service,
 * for every door) and the clamped offset, and the wire carries BOTH the snapshot terms a subscription was
 * made at and the plan's CURRENT terms - with nulls when the plan is gone, because an absent plan is not
 * a plan with no terms.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the five
 * controller tests before this one follow.
 */
@ExtendWith(MockitoExtension.class)
class SubscriptionControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private SubscriptionService service;

    private SubscriptionController controller;

    @BeforeEach
    void setUp() {
        controller = new SubscriptionController(service);
    }

    private static CreatorClaim claim(String accountId) {
        return new CreatorClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static PlanEntry plan(String planId, long priceCents, String period, boolean active) {
        return new PlanEntry(planId, "acct-a", "ada", "unsigned-local", priceCents, "CNY", period, active, AT);
    }

    private static SubscriptionEntry subscription() {
        return new SubscriptionEntry(
                "sub-1", "acct-b", "acct-a", "plan-1", 500L, "CNY", "month",
                AT, AT.plusSeconds(2_592_000), true, "bob", "unsigned-local");
    }

    @Test
    void anOfferedPlanAnswers201WithTheWholeCountAndTheFirstWindow() {
        when(service.offer("plan-1", 500L, "CNY", "month", claim("acct-a"))).thenReturn(plan("plan-1", 500L, "month", true));
        when(service.countPlans("acct-a")).thenReturn(5);

        ResponseEntity<PlanAnswer> res = controller.offer(new PlanRequest("plan-1", 500L, "CNY", "month", claim("acct-a")));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        PlanAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.creatorId()).isEqualTo("acct-a");
        assertThat(answer.plans()).hasSize(1);
        Plan wire = answer.plans().get(0);
        assertThat(wire.planId()).isEqualTo("plan-1");
        assertThat(wire.priceCents()).isEqualTo(500L);
        assertThat(wire.currency()).isEqualTo("CNY");
        assertThat(wire.period()).isEqualTo("month");
        assertThat(wire.active()).isTrue();
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(wire.handle()).isEqualTo("ada");
        assertThat(wire.assurance()).isEqualTo("unsigned-local");
        // The WHOLE number of plans, like every other answer, and the receipt is the first window: the
        // row just made is the newest one.
        assertThat(answer.count()).isEqualTo(5);
        assertThat(answer.limit()).isEqualTo(SubscriptionService.DEFAULT_PLAN_LIMIT);
        assertThat(answer.offset()).isZero();
    }

    @Test
    void aNullPlanBodyIsAskedAsNullsAndAZeroPrice() {
        when(service.offer(null, 0L, null, null, null)).thenReturn(plan("plan-1", 0L, "month", true));
        when(service.countPlans("acct-a")).thenReturn(1);

        controller.offer(null);

        // A null body's price is ZERO, not a null Long: the primitive is the wire's own default, and the
        // service refuses "more than nothing" by name.
        verify(service).offer(null, 0L, null, null, null);
    }

    @Test
    void thePlansListAsksWithTheRawCapAndTheClampedOffset() {
        when(service.plansOf("acct-a", 500, 0)).thenReturn(List.of(plan("plan-1", 500L, "month", true)));
        when(service.countPlans("acct-a")).thenReturn(9);

        ResponseEntity<PlanAnswer> res = controller.plans("acct-a", 500, -3);

        verify(service).plansOf("acct-a", 500, 0);
        PlanAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        // The count is the WHOLE table's, not the window's, and the answer says which window it is.
        assertThat(answer.count()).isEqualTo(9);
        assertThat(answer.limit()).isEqualTo(500);
        assertThat(answer.offset()).isZero();
    }

    @Test
    void thePlansListDefaultsTheCapAndTheOffsetWhenTheyAreAbsent() {
        when(service.plansOf("acct-a", SubscriptionService.DEFAULT_PLAN_LIMIT, 0)).thenReturn(List.of());
        when(service.countPlans("acct-a")).thenReturn(0);

        controller.plans("acct-a", null, null);

        verify(service).plansOf("acct-a", SubscriptionService.DEFAULT_PLAN_LIMIT, 0);
    }

    @Test
    void aSubscriptionAnswers201WithOnePeriodOfTotalsAndTheCurrentTerms() {
        when(service.subscribe("plan-1", claim("acct-b"))).thenReturn(subscription());
        when(service.currentPlanOf("plan-1")).thenReturn(plan("plan-1", 500L, "month", true));
        when(service.standingOf(any(SubscriptionEntry.class))).thenReturn("standing");

        ResponseEntity<SubscriptionAnswer> res = controller.subscribe(new SubscribeRequest("plan-1", claim("acct-b")));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        SubscriptionAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.subscriberId()).isEqualTo("acct-b");
        assertThat(answer.subscriptions()).hasSize(1);
        Subscription wire = answer.subscriptions().get(0);
        assertThat(wire.id()).isEqualTo("sub-1");
        assertThat(wire.planId()).isEqualTo("plan-1");
        assertThat(wire.creatorId()).isEqualTo("acct-a");
        assertThat(wire.subscriberId()).isEqualTo("acct-b");
        // The SNAPSHOT: the price the supporter agreed to, and the period it was for.
        assertThat(wire.priceCents()).isEqualTo(500L);
        assertThat(wire.period()).isEqualTo("month");
        // And the CURRENT terms beside it, from the plan as it stands now.
        assertThat(wire.currentPriceCents()).isEqualTo(500L);
        assertThat(wire.currentPeriod()).isEqualTo("month");
        assertThat(wire.currentActive()).isTrue();
        // The receipt says what came to, PER PERIOD - and this subscription is one period with one amount.
        assertThat(answer.totalsByPeriod()).containsExactly(new PeriodTotal("month", "CNY", 500L));
        assertThat(answer.count()).isEqualTo(1L);
        assertThat(answer.limit()).isEqualTo(SubscriptionService.DEFAULT_SUBSCRIPTION_LIMIT);
        assertThat(answer.offset()).isZero();
    }

    @Test
    void theWireCarriesTheRepricedTermsAndNullWhenThePlanIsGone() {
        when(service.subscribe("plan-1", claim("acct-b"))).thenReturn(subscription());
        // v317 repriced the plan since the promise was made: the snapshot stays, the current terms move.
        when(service.currentPlanOf("plan-1")).thenReturn(plan("plan-1", 750L, "year", false));
        when(service.standingOf(any(SubscriptionEntry.class))).thenReturn("standing");

        ResponseEntity<SubscriptionAnswer> res = controller.subscribe(new SubscribeRequest("plan-1", claim("acct-b")));

        Subscription wire = res.getBody().subscriptions().get(0);
        assertThat(wire.priceCents()).isEqualTo(500L);
        assertThat(wire.period()).isEqualTo("month");
        assertThat(wire.currentPriceCents()).isEqualTo(750L);
        assertThat(wire.currentPeriod()).isEqualTo("year");
        assertThat(wire.currentActive()).isFalse();
    }

    @Test
    void aGonePlanLeavesTheCurrentTermsNullRatherThanZero() {
        when(service.subscribe("plan-1", claim("acct-b"))).thenReturn(subscription());
        when(service.currentPlanOf("plan-1")).thenReturn(null);
        when(service.standingOf(any(SubscriptionEntry.class))).thenReturn("standing");

        ResponseEntity<SubscriptionAnswer> res = controller.subscribe(new SubscribeRequest("plan-1", claim("acct-b")));

        Subscription wire = res.getBody().subscriptions().get(0);
        // An absent plan is not a plan with no terms: the wire says nothing rather than guessing.
        assertThat(wire.currentPriceCents()).isNull();
        assertThat(wire.currentPeriod()).isNull();
        assertThat(wire.currentActive()).isNull();
    }

    @Test
    void theCreatorDirectionTrimsTheEchoedCreatorAndCarriesTheWindow() {
        when(service.subscriptionsReceived("  acct-a  ", 500, 0)).thenReturn(List.of(subscription()));
        when(service.currentPlansOf(any())).thenReturn(Map.of());
        when(service.totalsReceived("  acct-a  ")).thenReturn(List.of(new PeriodTotal("month", "CNY", 500L)));
        when(service.countReceived("  acct-a  ")).thenReturn(4L);
        when(service.standingOf(any(SubscriptionEntry.class))).thenReturn("standing");

        ResponseEntity<?> res = controller.subscriptions(null, "  acct-a  ", 500, -3);

        verify(service).subscriptionsReceived("  acct-a  ", 500, 0);
        assertThat(res.getBody()).isInstanceOf(ReceivedSubscriptionsAnswer.class);
        ReceivedSubscriptionsAnswer answer = (ReceivedSubscriptionsAnswer) res.getBody();
        // The ANSWER trims what the ASK did not, the same rule the filed reports direction keeps.
        assertThat(answer.creatorId()).isEqualTo("acct-a");
        assertThat(answer.totalsByPeriod()).containsExactly(new PeriodTotal("month", "CNY", 500L));
        assertThat(answer.count()).isEqualTo(4L);
        assertThat(answer.limit()).isEqualTo(500);
        assertThat(answer.offset()).isZero();
        assertThat(answer.subscriptions()).hasSize(1);
    }

    @Test
    void theSubscriberDirectionAsksTheHeldSideAndEchoesTheRawName() {
        when(service.subscriptionsOf("  acct-b  ", SubscriptionService.DEFAULT_SUBSCRIPTION_LIMIT, 0))
                .thenReturn(List.of(subscription()));
        when(service.currentPlansOf(any())).thenReturn(Map.of());
        when(service.totalsHeld("  acct-b  ")).thenReturn(List.of(new PeriodTotal("month", "CNY", 500L)));
        when(service.countHeld("  acct-b  ")).thenReturn(1L);
        when(service.standingOf(any(SubscriptionEntry.class))).thenReturn("standing");

        ResponseEntity<?> res = controller.subscriptions("  acct-b  ", null, null, null);

        verify(service).subscriptionsOf("  acct-b  ", SubscriptionService.DEFAULT_SUBSCRIPTION_LIMIT, 0);
        assertThat(res.getBody()).isInstanceOf(SubscriptionAnswer.class);
        SubscriptionAnswer answer = (SubscriptionAnswer) res.getBody();
        // This direction does NOT trim: the asymmetry with the creator direction is pinned, not smoothed.
        assertThat(answer.subscriberId()).isEqualTo("  acct-b  ");
        assertThat(answer.count()).isEqualTo(1L);
    }

    @Test
    void aQuestionThatNamesNeitherSubscriberNorCreatorIsA400ThatNamesBoth() {
        ResponseEntity<?> res = controller.subscriptions(null, null, null, null);

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody()).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) res.getBody();
        assertThat(body).containsEntry("error", "invalid-subscription");
        assertThat(body.get("message")).contains("subscriber").contains("creator");
    }

    @Test
    void theRetireClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.retire("plan-1", new CreatorClaim("acct-a", null, null, null))).thenReturn(true);

        ResponseEntity<Map<String, Object>> res = controller.retire("plan-1", "acct-a");

        ArgumentCaptor<CreatorClaim> captor = ArgumentCaptor.forClass(CreatorClaim.class);
        verify(service).retire(eq("plan-1"), captor.capture());
        CreatorClaim asked = captor.getValue();
        assertThat(asked.accountId()).isEqualTo("acct-a");
        assertThat(asked.handle()).isNull();
        assertThat(asked.assurance()).isNull();
        assertThat(asked.claimedAt()).isNull();
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody())
                .containsEntry("ok", true)
                .containsEntry("planId", "plan-1")
                .containsEntry("retired", true);
    }

    @Test
    void anAlreadyRetiredPlanAnswers200WithRetiredFalse() {
        when(service.retire("plan-1", new CreatorClaim("acct-a", null, null, null))).thenReturn(false);

        ResponseEntity<Map<String, Object>> res = controller.retire("plan-1", "acct-a");

        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).containsEntry("retired", false);
    }

    @Test
    void theCancelClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.cancel("sub-1", new CreatorClaim("acct-b", null, null, null))).thenReturn(true);

        ResponseEntity<Map<String, Object>> res = controller.cancel("sub-1", "acct-b");

        ArgumentCaptor<CreatorClaim> captor = ArgumentCaptor.forClass(CreatorClaim.class);
        verify(service).cancel(eq("sub-1"), captor.capture());
        assertThat(captor.getValue().accountId()).isEqualTo("acct-b");
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody())
                .containsEntry("ok", true)
                .containsEntry("subscriptionId", "sub-1")
                .containsEntry("ended", true);
    }

    @Test
    void aRepriceWithNoPriceAsksZeroRatherThanANull() {
        when(service.reprice("plan-1", 0L, "month", new CreatorClaim("acct-a", null, null, null)))
                .thenReturn(plan("plan-1", 0L, "month", true));

        ResponseEntity<Map<String, Object>> res = controller.reprice("plan-1", "acct-a", null, "month");

        // A missing price is ZERO on the wire, the same rule the tips door keeps: the service refuses a
        // price of nothing by name, which is a rule; a null reaching it would be a crash.
        verify(service).reprice("plan-1", 0L, "month", new CreatorClaim("acct-a", null, null, null));
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody())
                .containsEntry("ok", true)
                .containsEntry("planId", "plan-1")
                .containsEntry("priceCents", 0L)
                .containsEntry("period", "month");
    }

    @Test
    void aRepriceWithAPriceTravelsItWhole() {
        when(service.reprice("plan-1", 2500L, "year", new CreatorClaim("acct-a", null, null, null)))
                .thenReturn(plan("plan-1", 2500L, "year", true));

        controller.reprice("plan-1", "acct-a", 2500L, "year");

        verify(service).reprice("plan-1", 2500L, "year", new CreatorClaim("acct-a", null, null, null));
    }

    @Test
    void somebodyElsesPlanIsA403NotA400() {
        ResponseEntity<Map<String, String>> res = controller.notYourPlan(new NotYourPlan("that plan is not yours"));

        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody())
                .containsEntry("error", "not-your-plan")
                .containsEntry("message", "that plan is not yours");
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidSubscription("a plan needs a price"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-subscription")
                .containsEntry("message", "a plan needs a price");
    }
}
