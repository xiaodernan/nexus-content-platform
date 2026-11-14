package com.nexus.domain.billing;

import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The billing reader, graded without a Spring context (same style as the community tests).
 *
 * <p>The leg that matters most is the unknown kind: a misspelled kind must be refused BEFORE the query —
 * the alternative answer, "sums to zero", would be read as "this person has no credits", which is an
 * absence claim hiding a typo.
 */
@ExtendWith(MockitoExtension.class)
class BillingServiceTest {

    private static final UUID USER = UUID.fromString("cccccccc-0000-0000-0000-000000000001");

    @Mock private CreditLedgerRepository ledger;
    @Mock private UserRepository users;

    @Test
    void theBalanceIsTheSumTheLedgerAnswers_forOneKind() {
        when(ledger.balanceOf(USER, "ai")).thenReturn(140L);

        assertThat(new BillingService(ledger, users).getCreditBalance(USER, "ai")).isEqualTo(140L);
    }

    @Test
    void anUnknownKindIsRefusedBeforeAnyQuery() {
        BillingService service = new BillingService(ledger, users);

        assertThatThrownBy(() -> service.getCreditBalance(USER, "a1"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("a1");

        verifyNoInteractions(ledger);
    }

    @Test
    void hasEnoughIsTheBoundary_notANudge() {
        when(ledger.balanceOf(USER, "image")).thenReturn(20L);
        BillingService service = new BillingService(ledger, users);

        assertThat(service.hasEnoughCredits(USER, "image", 20)).isTrue();
        assertThat(service.hasEnoughCredits(USER, "image", 21)).isFalse();
    }

    @Test
    void thePlanComesBackAsTheSchemaStoresIt_lowercase() {
        User user = new User();
        user.setId(USER);
        user.setPlan(User.UserPlan.CREATOR);
        when(users.findById(USER)).thenReturn(Optional.of(user));

        assertThat(new BillingService(ledger, users).getSubscriptionPlan(USER)).isEqualTo("creator");
    }

    @Test
    void aUserThatDoesNotExistIsARefusal_notAFreePlan() {
        when(users.findById(USER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> new BillingService(ledger, users).getSubscriptionPlan(USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(USER.toString());
    }
}
