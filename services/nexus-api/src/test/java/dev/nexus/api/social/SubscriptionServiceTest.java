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

    private static CreatorClaim claim(String accountId) {
        return new CreatorClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
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
