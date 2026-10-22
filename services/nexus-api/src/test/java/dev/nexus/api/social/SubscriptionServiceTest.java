package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.SubscriptionDtos.CreatorClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * The six rules {@link SubscriptionService} owns, and the two behaviours that are not rules: the price
 * SNAPSHOT, and the "already ended" answer.
 *
 * <p>No Spring context and no database here on purpose — these cases are about what the service decides.
 * The clock is PINNED, so the instants a plan and a subscription record are asserted rather than read back
 * and compared to themselves.
 */
@ExtendWith(MockitoExtension.class)
class SubscriptionServiceTest {

    private static final Instant AT = Instant.parse("2026-10-21T11:00:00Z");

    @Mock
    private PlanRepository plans;

    @Mock
    private SubscriptionRepository subscriptions;

    private SubscriptionService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new SubscriptionService(plans, subscriptions, clock);
    }

    /** A claim that carries a HANDLE, the way a device with an account sends one. */
    private static CreatorClaim claimWithHandle(String accountId, String handle) {
        return new CreatorClaim(accountId, handle, "unsigned-local", AT.toEpochMilli());
    }

    private static CreatorClaim claim(String accountId) {
        return new CreatorClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    /** A claim that carried NO handle — a device that named only its account id. */
    private static CreatorClaim claimWithoutHandle(String accountId) {
        return new CreatorClaim(accountId, null, "unsigned-local", 1_700_000_000_000L);
    }

    private static PlanEntry plan(String planId, String creator, long price, String period) {
        return new PlanEntry(planId, creator, "ada", "unsigned-local", price, "CNY", period, true, AT);
    }

    private static SubscriptionEntry subscription(
            String subscriptionId, boolean active, Instant expiresAt) {
        return new SubscriptionEntry(
                subscriptionId,
                "acct-bob",
                "acct-ada",
                "pro",
                1500L,
                "CNY",
                "month",
                AT,
                expiresAt,
                active);
    }

    // ── rule 1: a plan needs a CREATOR, a POSITIVE price and a period ─────────────────────────────

    @Test
    void aPlanWithNoCreatorIsREFUSEDByName() {
        assertThatThrownBy(() -> service.offer("pro", 1500, "CNY", "month", null))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("needs an account to offer it");
        verify(plans, never()).save(any());
    }

    @Test
    void aFreePlanIsREFUSEDAndTheRefusalSaysWhy() {
        // A price of zero is not a price, it is the absence of one.
        assertThatThrownBy(() -> service.offer("pro", 0, "CNY", "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("cannot be free");
    }

    @Test
    void aNegativePriceIsREFUSED() {
        assertThatThrownBy(() -> service.offer("pro", -100, "CNY", "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("cannot be negative");
    }

    @Test
    void anAbsurdPriceIsREFUSEDWithTheCapNamed() {
        assertThatThrownBy(() -> service.offer("pro", SubscriptionService.MAX_PRICE_CENTS + 1, "CNY", "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("at most " + SubscriptionService.MAX_PRICE_CENTS + " cents");
    }

    @Test
    void aPeriodOUTSIDETheThreeIsREFUSEDAndTheRefusalNAMESThem() {
        assertThatThrownBy(() -> service.offer("pro", 1500, "CNY", "fortnight", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("once, month, year");
    }

    @Test
    void aSecondPlanWithTheSameIdIsREFUSEDAndTheRefusalSaysWhy() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));

        assertThatThrownBy(() -> service.offer("pro", 1500, "CNY", "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("already exists")
                .hasMessageContaining("ADDRESS");
    }

    @Test
    void thePlanRecordsTheCreatorThePriceAndTheSERVICEsInstant() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.empty());
        when(plans.save(any(PlanEntry.class))).thenAnswer(i -> i.getArgument(0));

        PlanEntry row = service.offer("pro", 1500, "CNY", "month", claim("acct-ada"));

        assertThat(row.getCreatorAccountId()).isEqualTo("acct-ada");
        assertThat(row.getPriceCents()).isEqualTo(1500L);
        assertThat(row.getPeriod()).isEqualTo("month");
        assertThat(row.getCreatedAt()).isEqualTo(AT);
        assertThat(row.isActive()).isTrue();
    }

    // ── rule 2: a subscription needs a SUBSCRIBER and a plan that is still offered ───────────────────

    @Test
    void aSubscriptionToAPlanThatDoesNotExistIsREFUSEDByName() {
        when(plans.findByPlanId("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.subscribe("nope", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("no plan with this id");
    }

    @Test
    void aSubscriptionToARetiredPlanIsREFUSED() {
        PlanEntry retired = new PlanEntry("pro", "acct-bob", "bob", "unsigned-local", 1500, "CNY", "month", false, AT);
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(retired));

        assertThatThrownBy(() -> service.subscribe("pro", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("not offered any more");
    }

    @Test
    void aSubscriptionWithNoSubscriberIsREFUSEDByName() {
        assertThatThrownBy(() -> service.subscribe("pro", null))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("needs an account to hold it");
    }

    // ── rule 3: an account cannot subscribe to its OWN plan ──────────────────────────────────────

    @Test
    void anAccountCannotSubscribeToItsOwnPlanAndTheRefusalSaysWhy() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));

        assertThatThrownBy(() -> service.subscribe("pro", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("cannot subscribe to its own plan")
                .hasMessageContaining("no-op");
        verify(subscriptions, never()).save(any());
    }

    // ── rule 4: one subscription per supporter per plan ──────────────────────────────────────────

    @Test
    void aSECONDSubscriptionToTheSamePlanIsREFUSEDByName() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro"))
                .thenReturn(Optional.of(new SubscriptionEntry(
                        "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, null, true)));

        assertThatThrownBy(() -> service.subscribe("pro", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("already backs this plan");
    }

    // ── v313: a subscription that ENDED is a DIFFERENT fact, and the refusal says so ──────────────

    @Test
    void aSubscriptionWhosePeriodRanOutIsREFUSEDWithTheTruth_NotWithAlreadyBacks() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "month")));
        // The row is still flagged active (the flag means "not cancelled"), and its expiry has PASSED.
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro"))
                .thenReturn(Optional.of(new SubscriptionEntry(
                        "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, AT.minusSeconds(1), true)));

        // "this account already backs this plan" would be a lie: the period ran out and the account does
        // not back the plan any more. The refusal names the date and the rule that makes it permanent.
        assertThatThrownBy(() -> service.subscribe("pro", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("ended on")
                .hasMessageContaining("cannot renew it")
                .hasMessageContaining("one subscription per supporter per plan")
                .hasMessageContaining("no billing");
    }

    @Test
    void aCancelledSubscriptionIsREFUSEDWithItsOwnTruth() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro"))
                .thenReturn(Optional.of(new SubscriptionEntry(
                        "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, null, false)));

        assertThatThrownBy(() -> service.subscribe("pro", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("cancelled this subscription")
                .hasMessageContaining("cannot be made again");
    }

    // ── v314: a creator can RETIRE their own plan ────────────────────────────────────────────────

    @Test
    void theCreatorCanRetireTheirOwnPlan() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(plans.save(any(PlanEntry.class))).thenAnswer(i -> i.getArgument(0));

        assertThat(service.retire("pro", claim("acct-ada"))).isTrue();
        verify(plans).save(any(PlanEntry.class));
    }

    @Test
    void retiringSomebodyElsesPlanIsREFUSED() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));

        assertThatThrownBy(() -> service.retire("pro", claim("acct-bob")))
                .isInstanceOf(NotYourPlan.class)
                .hasMessageContaining("only the account that offers it may retire it");
        verify(plans, never()).save(any(PlanEntry.class));
    }

    @Test
    void aPlanThatDoesNotExistIsALREADYGoneRatherThanAFailure() {
        when(plans.findByPlanId("nope")).thenReturn(Optional.empty());
        assertThat(service.retire("nope", claim("acct-ada"))).isFalse();
    }

    @Test
    void aPlanThatIsAlreadyRetiredIsALREADYRetired() {
        PlanEntry retired = plan("pro", "acct-ada", 1500, "month");
        retired.markRetired();
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(retired));

        assertThat(service.retire("pro", claim("acct-ada"))).isFalse();
        verify(plans, never()).save(any(PlanEntry.class));
    }

    @Test
    void retiringAPlanDoesNOTTouchTheSubscriptionsAlreadyMadeAgainstIt() {
        // A supporter who backed the plan for a month was promised that month: taking the OFFER away does
        // not take the promise with it.
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(plans.save(any(PlanEntry.class))).thenAnswer(i -> i.getArgument(0));

        service.retire("pro", claim("acct-ada"));

        verify(subscriptions, never()).save(any(SubscriptionEntry.class));
    }

    // ── rule 5: the price is a SNAPSHOT ───────────────────────────────────────────────────────────

    @Test
    void theSubscriptionSnapshotsThePlansPriceAtTheMomentOfSubscribing() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claim("acct-ada"));

        // The price came from the PLAN, not from the subscriber: a supporter does not get to name the
        // price they are paying.
        assertThat(row.getPriceCents()).isEqualTo(1500L);
        assertThat(row.getCurrency()).isEqualTo("CNY");
        assertThat(row.getPeriod()).isEqualTo("month");
        assertThat(row.getCreatorAccountId()).isEqualTo("acct-bob");
        assertThat(row.getSubscriberAccountId()).isEqualTo("acct-ada");
        assertThat(row.getSubscribedAt()).isEqualTo(AT);
    }

    @Test
    void aMonthsExpiryIsComputedOnceFromThePeriod() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claim("acct-ada"));

        assertThat(row.getExpiresAt()).isEqualTo(AT.plus(java.time.Duration.ofDays(30)));
    }

    @Test
    void aOneOffPlanNeverExpires() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-bob", 1500, "once")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-ada", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claim("acct-ada"));

        assertThat(row.getExpiresAt()).isNull();
    }

    // ── rule 6: only the subscriber can end their own subscription ────────────────────────────────

    @Test
    void endingYourOwnSubscriptionMarksItEndedAndKeepsTheRow() {
        SubscriptionEntry mine = new SubscriptionEntry(
                "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, null, true);
        when(subscriptions.findBySubscriptionId("s-1")).thenReturn(Optional.of(mine));
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        boolean ended = service.cancel("s-1", claim("acct-ada"));

        assertThat(ended).isTrue();
        assertThat(mine.isActive()).isFalse();
        // The row STAYS: a subscription that was ended is a fact that happened.
        verify(subscriptions, times(1)).save(mine);
    }

    @Test
    void endingSomebodyElsesSubscriptionIsREFUSEDAndChangesNothing() {
        when(subscriptions.findBySubscriptionId("s-1")).thenReturn(Optional.of(new SubscriptionEntry(
                "s-1", "acct-someone-else", "acct-bob", "pro", 1500, "CNY", "month", AT, null, true)));

        assertThatThrownBy(() -> service.cancel("s-1", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("only its holder may end it");
        verify(subscriptions, never()).save(any());
    }

    @Test
    void endingASubscriptionThatIsAlreadyGoneIsALREADY_GONE() {
        when(subscriptions.findBySubscriptionId("s-1")).thenReturn(Optional.of(new SubscriptionEntry(
                "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, null, false)));

        assertThat(service.cancel("s-1", claim("acct-ada"))).isFalse();
        verify(subscriptions, never()).save(any());
    }

    // ── the read ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void thePlansOfACreatorAreReadNewestFirstAndCapped() {
        when(plans.findByCreatorAccountIdOrderByCreatedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(plan("pro", "acct-ada", 1500, "month")));

        assertThat(service.plansOf("acct-ada", 20)).hasSize(1);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(plans).findByCreatorAccountIdOrderByCreatedAtDesc(eq("acct-ada"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(SubscriptionService.DEFAULT_PLAN_LIMIT);
    }

    @Test
    void theSubscriptionsAnAccountHoldsAreReadNewestFirst() {
        when(subscriptions.findBySubscriberAccountIdOrderBySubscribedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(new SubscriptionEntry(
                        "s-1", "acct-ada", "acct-bob", "pro", 1500, "CNY", "month", AT, null, true)));

        assertThat(service.subscriptionsOf("acct-ada", 20)).hasSize(1);
    }

    // ── v330: the plan's creator's NAME is copied on, like the price ───────

    @Test
    void thePlansCreatorsNameIsCopiedOntoTheSubscription() {
        // A plan id is an ADDRESS, and a supporter reading their own list should not have to know which
        // address belongs to the person whose work they are backing. The plan knows the creator's name
        // (the creator's own claim, since v301); the subscription copies it, the way it copies the price.
        PlanEntry offered = plan("pro", "acct-ada", 1500, "month");
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(offered));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-bob", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claim("acct-bob"));

        assertThat(row.getCreatorHandle()).isEqualTo(offered.getCreatorHandle());
    }

    // ── v328: the instant a subscription was TAKEN BACK ──────────────────────────────────────────────

    @Test
    void theInstantTheSubscriptionWasTakenBackIsWrittenDown() {
        // A row that said THAT it ended and never WHEN left a creator asking "who stopped, and when"
        // with half an answer.
        when(subscriptions.findBySubscriptionId("s-1")).thenReturn(Optional.of(
                new SubscriptionEntry("s-1", "acct-bob", "acct-ada", "pro", 1500, "CNY", "month", AT, null, true)));
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        boolean moved = service.cancel("s-1", claim("acct-bob"));

        assertThat(moved).isTrue();
        ArgumentCaptor<SubscriptionEntry> row = ArgumentCaptor.forClass(SubscriptionEntry.class);
        verify(subscriptions).save(row.capture());
        assertThat(row.getValue().getEndedAt()).isNotNull();
    }

    @Test
    void aSubscriptionThatWasNeverTakenBackHasNoEnding() {
        // The ending is the CANCELLATION's: a subscription that merely ran out of its period ended on
        // `expiresAt`, which is a different date and a different fact. A standing subscription has no
        // ending at all.
        SubscriptionEntry standing =
                new SubscriptionEntry("s-1", "acct-bob", "acct-ada", "pro", 1500, "CNY", "month", AT, null, true);

        assertThat(standing.getEndedAt()).isNull();
    }

    // ── v359: the counts and the totals are the WHOLE table's ─────────────────────

    @Test
    void theSubscriptionsOneAccountHoldsAreCountedOverTheWholeTable() {
        // A panel that shows a list of subscriptions and says "2" when the account holds five is quoting a
        // window, and the count is the DATABASE's count so it is a fact about the account.
        when(subscriptions.countBySubscriberAccountId("acct-bob")).thenReturn(5L);

        assertThat(service.countHeld("acct-bob")).isEqualTo(5L);
    }

    @Test
    void theSubscriptionsOneAccountReceivedAreCountedOverTheWholeTable() {
        when(subscriptions.countByCreatorAccountId("acct-ada")).thenReturn(9L);

        assertThat(service.countReceived("acct-ada")).isEqualTo(9L);
    }

    @Test
    void theTotalHeldIsTheWholeTablesStandingSum() {
        // The standing is the service's word (v308) and the clock is the service's, so the instant
        // travels with the query and the database does the same arithmetic.
        when(subscriptions.sumStandingPriceCentsBySubscriberAccountId(eq("acct-bob"), any(java.time.Instant.class)))
                .thenReturn(4200L);

        assertThat(service.totalHeld("acct-bob")).isEqualTo(4200L);
    }

    @Test
    void theTotalReceivedIsTheWholeTablesStandingSum() {
        when(subscriptions.sumStandingPriceCentsByCreatorAccountId(eq("acct-ada"), any(java.time.Instant.class)))
                .thenReturn(7500L);

        assertThat(service.totalReceived("acct-ada")).isEqualTo(7500L);
    }

    // ── v368: the totals are PER PERIOD, because a monthly and a yearly one do not add up ───────

    @Test
    void theTotalsArePerPeriodAndNotOneMeaninglessSum() {
        // One monthly pledge and one yearly one do not add up to anything a reader can act on, so the
        // answer says what each period comes to.
        when(subscriptions.sumStandingPriceCentsByPeriodHeld(eq("acct-bob"), any(java.time.Instant.class)))
                .thenReturn(List.of(new Object[] {"month", "CNY", 1500L}, new Object[] {"year", "CNY", 3000L}));

        List<SubscriptionDtos.PeriodTotal> totals = service.totalsHeld("acct-bob");

        assertThat(totals).hasSize(2);
        assertThat(totals.get(0).period()).isEqualTo("month");
        assertThat(totals.get(0).currency()).isEqualTo("CNY");
        assertThat(totals.get(0).totalCents()).isEqualTo(1500L);
        assertThat(totals.get(1).period()).isEqualTo("year");
        assertThat(totals.get(1).currency()).isEqualTo("CNY");
        assertThat(totals.get(1).totalCents()).isEqualTo(3000L);
    }

    @Test
    void moneyInTwoCurrenciesNeverSharesAGroup() {
        // A monthly pledge in CNY and a yearly one in USD do not add up to one number, so they are two
        // groups — and each carries its own currency.
        when(subscriptions.sumStandingPriceCentsByPeriodHeld(eq("acct-bob"), any(java.time.Instant.class)))
                .thenReturn(List.of(new Object[] {"month", "CNY", 1500L}, new Object[] {"year", "USD", 3000L}));

        List<SubscriptionDtos.PeriodTotal> totals = service.totalsHeld("acct-bob");

        assertThat(totals).hasSize(2);
        assertThat(totals.get(0).currency()).isEqualTo("CNY");
        assertThat(totals.get(1).currency()).isEqualTo("USD");
    }

    @Test
    void thePeriodsComeInTheOrderAPersonWouldSayThem() {
        when(subscriptions.sumStandingPriceCentsByPeriodReceived(eq("acct-ada"), any(java.time.Instant.class)))
                .thenReturn(List.of(new Object[] {"year", "CNY", 3000L}, new Object[] {"once", "CNY", 500L},
                        new Object[] {"month", "CNY", 1500L}));

        List<SubscriptionDtos.PeriodTotal> totals = service.totalsReceived("acct-ada");

        assertThat(totals.stream().map(SubscriptionDtos.PeriodTotal::period).toList())
                .containsExactly("once", "month", "year");
    }

    // ── v327: the subscriber's NAME goes on the row, so a creator sees a person ──────────────────

    @Test
    void theSubscribersNameGoesOnTheRow() {
        // The follow row has kept the follower's handle since v288, and a creator looking at the
        // subscriptions they received was looking at ADDRESSES: the handle was in the claim all along.
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-bob", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claimWithHandle("acct-bob", "bob"));

        assertThat(row.getSubscriberHandle()).isEqualTo("bob");
    }

    @Test
    void aClaimWithNoHandleLeavesNoName() {
        // A claim that carried no handle leaves no name: the panel then shows the account id rather than
        // inventing one.
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(subscriptions.findBySubscriberAccountIdAndPlanId("acct-bob", "pro")).thenReturn(Optional.empty());
        when(subscriptions.save(any(SubscriptionEntry.class))).thenAnswer(i -> i.getArgument(0));

        SubscriptionEntry row = service.subscribe("pro", claimWithoutHandle("acct-bob"));

        assertThat(row.getSubscriberHandle()).isNull();
    }

    // ── v317: the creator can CHANGE the price of a plan they offer ─────────────────────────

    @Test
    void theCreatorCanChangeThePriceOfTheirOwnPlan() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(plans.save(any(PlanEntry.class))).thenAnswer(i -> i.getArgument(0));

        PlanEntry row = service.reprice("pro", 2500, "month", claim("acct-ada"));

        assertThat(row.getPriceCents()).isEqualTo(2500L);
        verify(plans).save(any(PlanEntry.class));
    }

    @Test
    void aPriceChangeDoesNOTTouchTheSubscriptionsAlreadyMade() {
        // The SNAPSHOT earns its keep here: a supporter who agreed to 1500 a month still agreed to 1500 a
        // month, and the new price is what the NEXT subscriber agrees to.
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));
        when(plans.save(any(PlanEntry.class))).thenAnswer(i -> i.getArgument(0));

        service.reprice("pro", 2500, "month", claim("acct-ada"));

        verify(subscriptions, never()).save(any(SubscriptionEntry.class));
    }

    @Test
    void changingSomebodyElsesPlanPriceIsREFUSED() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));

        assertThatThrownBy(() -> service.reprice("pro", 2500, "month", claim("acct-bob")))
                .isInstanceOf(NotYourPlan.class)
                .hasMessageContaining("only the account that offers it may change its price");
        verify(plans, never()).save(any(PlanEntry.class));
    }

    @Test
    void aPriceThatIsNotPositiveIsREFUSEDByName() {
        when(plans.findByPlanId("pro")).thenReturn(Optional.of(plan("pro", "acct-ada", 1500, "month")));

        assertThatThrownBy(() -> service.reprice("pro", 0, "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("must be positive");
    }

    @Test
    void aPlanThatDoesNotExistIsREFUSEDByName() {
        when(plans.findByPlanId("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.reprice("nope", 2500, "month", claim("acct-ada")))
                .isInstanceOf(InvalidSubscription.class)
                .hasMessageContaining("no plan with this id");
    }

    // ── v308: WHERE a subscription STANDS, computed rather than remembered ──────────────────────────

    @Test
    void aSubscriptionThatHasNotRunOutIsSTANDING() {
        SubscriptionEntry row = subscription("sub-1", true, AT.plusSeconds(3600));
        assertThat(service.standingOf(row)).isEqualTo(SubscriptionDtos.STATUS_ACTIVE);
    }

    @Test
    void aSubscriptionWhosePeriodHasRunOutIsEXPIRED_evenThoughTheRowStillSaysActive() {
        // The load-bearing case: the row was never written to again, so its flag still says "active" — and
        // the standing is computed from the expiry, not read from the flag.
        SubscriptionEntry row = subscription("sub-1", true, AT.minusSeconds(1));
        assertThat(row.isActive()).isTrue();
        assertThat(service.standingOf(row)).isEqualTo(SubscriptionDtos.STATUS_EXPIRED);
    }

    @Test
    void aSubscriptionTheSupporterEndedIsCANCELLED() {
        SubscriptionEntry row = subscription("sub-1", false, AT.plusSeconds(3600));
        assertThat(service.standingOf(row)).isEqualTo(SubscriptionDtos.STATUS_CANCELLED);
    }

    @Test
    void aSubscriptionWithNoExpiryIsSTANDING() {
        SubscriptionEntry row = subscription("sub-1", true, null);
        assertThat(service.standingOf(row)).isEqualTo(SubscriptionDtos.STATUS_ACTIVE);
    }

    @Test
    void theExpiryIsTheInstantItself_NotTheMillisecondAfter() {
        // A subscription whose expiry is exactly now has run out: the period is a span that ENDS at that
        // instant, and a row that said otherwise would keep standing for a millisecond it did not have.
        SubscriptionEntry row = subscription("sub-1", true, AT);
        assertThat(service.standingOf(row)).isEqualTo(SubscriptionDtos.STATUS_EXPIRED);
    }
}
