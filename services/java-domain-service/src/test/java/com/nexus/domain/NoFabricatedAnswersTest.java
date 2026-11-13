package com.nexus.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.nexus.domain.billing.BillingService;
import com.nexus.domain.billing.CreditLedgerRepository;
import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The guard against a FABRICATED answer coming back.
 *
 * <p>This service once shipped answers it had never established: a credit balance of {@code 0}, an
 * admin flag of {@code false}, a plan of {@code "free"}. The rule that forbids them is §159 — no surface
 * may answer with a fact it did not establish — and this class exists so that one "helpful" edit that
 * restores a constant literal cannot put the lie back quietly.
 *
 * <p>The population of this guard changed when the two parallel lines were merged. The merged tree owns
 * its answers for real now:
 *
 * <ul>
 *   <li>{@code BillingService} is a genuine READER of the §134 ledger — its answers are SUM(delta) in
 *       the database and the {@code users.plan} row, never a constant. The guard below pins that shape:
 *       the answers it gives must be the ones the repositories gave back.</li>
 *   <li>{@code CommunityService} really writes likes/follows (this line) against the shared schema.</li>
 *   <li>{@code PermissionService} really reads role/ownership off the rows the web layer wrote.</li>
 * </ul>
 *
 * <p>The old premise of this guard — "these three services answer nothing; every method must refuse
 * with {@code UnimplementedOperation}" — no longer describes this tree: every method either reads a
 * real row or writes one. The refusal type itself is still tested here (the carriage test below),
 * because a refusal that does not say WHY is not a refusal.
 */
@ExtendWith(MockitoExtension.class)
class NoFabricatedAnswersTest {

    @Mock
    private CreditLedgerRepository ledger;

    @Mock
    private UserRepository users;

    private BillingService billing;

    @BeforeEach
    void setUp() {
        billing = new BillingService(ledger, users);
    }

    @Test
    void theBalanceIsWhatTheLedgerReportsNotAConstant() {
        UUID user = UUID.randomUUID();
        when(ledger.balanceOf(eq(user), eq("ai"))).thenReturn(4242L);

        assertThat(billing.getCreditBalance(user, "ai")).isEqualTo(4242L);
        verify(ledger).balanceOf(user, "ai");
    }

    @Test
    void anUnknownKindIsRefusedBeforeAnyQueryIsBuilt() {
        assertThatThrownBy(() -> billing.getCreditBalance(UUID.randomUUID(), "platinum"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("platinum");
        // The invented-absence case: a typo must not silently SUM to zero and read as "no credits".
        org.mockito.Mockito.verifyNoInteractions(ledger);
    }

    @Test
    void hasEnoughCreditsComparesAgainstTheLedger() {
        UUID user = UUID.randomUUID();
        when(ledger.balanceOf(user, "ai")).thenReturn(10L);

        assertThat(billing.hasEnoughCredits(user, "ai", 5)).isTrue();
        assertThat(billing.hasEnoughCredits(user, "ai", 10)).isTrue();
        assertThat(billing.hasEnoughCredits(user, "ai", 11)).isFalse();
    }

    @Test
    void thePlanIsWhatTheRowSaysLowercasedNotADefault() {
        UUID user = UUID.randomUUID();
        User row = new User();
        row.setId(user);
        row.setPlan(User.UserPlan.STUDIO);
        when(users.findById(user)).thenReturn(Optional.of(row));

        assertThat(billing.getSubscriptionPlan(user)).isEqualTo("studio");
    }

    @Test
    void anUnknownUserIsRefusedByNameNotAnsweredWithFree() {
        UUID user = UUID.randomUUID();
        when(users.findById(user)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> billing.getSubscriptionPlan(user))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(user.toString());
    }

    @Test
    void aRefusalCarriesItsOwnTruthRatherThanAStringSomebodyHasToParse() {
        UnimplementedOperation refusal = new UnimplementedOperation("billing.getCreditBalance", "the ledger lives elsewhere");

        assertThat(refusal.getOperation()).isEqualTo("billing.getCreditBalance");
        assertThat(refusal.getReason()).isEqualTo("the ledger lives elsewhere");
        assertThat(refusal.getMessage())
                .contains("billing.getCreditBalance")
                .contains("the ledger lives elsewhere");
        assertThatThrownBy(() -> { throw refusal; })
                .isInstanceOf(UnimplementedOperation.class);
    }

    @Test
    void theBalanceRequestKindIsPassedThroughVerbatim() {
        UUID user = UUID.randomUUID();
        // Strict outcome: the repository sees exactly the kind string the caller sent, so a future
        // "helpful" normalization (or a silent default) cannot reroute which ledger column answers.
        ArgumentCaptor<String> kind = ArgumentCaptor.forClass(String.class);
        when(ledger.balanceOf(eq(user), anyString())).thenReturn(7L);

        assertThat(billing.getCreditBalance(user, "compute")).isEqualTo(7L);
        verify(ledger).balanceOf(eq(user), kind.capture());
        assertThat(kind.getValue()).isEqualTo("compute");
    }
}
