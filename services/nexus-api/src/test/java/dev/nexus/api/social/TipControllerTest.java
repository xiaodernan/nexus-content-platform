package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.TipDtos.Tip;
import dev.nexus.api.social.TipDtos.TipAnswer;
import dev.nexus.api.social.TipDtos.TipClaim;
import dev.nexus.api.social.TipDtos.TipRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M7 v421 - the HTTP surface for TIPS, graded directly.
 *
 * <p>Two doors: give one, and read the ones an account received (or, with {@code payer}, gave). What THIS
 * file grades is the controller's own decisions, and this door's are unusual in two ways. It CLAMPS THE
 * OFFSET BUT NOT THE CAP: a cap of 500 travels to the service as 500, because the service's own clamp is
 * the one clamp every door goes through, and the answer echoes what was ASKED rather than what the
 * service applied. And the write door's null-guards are part of the contract: a missing amount is ZERO
 * rather than a null, and a missing {@code anonymous} is false by {@code Boolean.TRUE.equals} rather than
 * by a null check that would NPE.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the three
 * controller tests before this one follow.
 */
@ExtendWith(MockitoExtension.class)
class TipControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private TipService service;

    private TipController controller;

    @BeforeEach
    void setUp() {
        controller = new TipController(service);
    }

    private static TipClaim claim(String accountId) {
        return new TipClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static TipEntry row() {
        return new TipEntry("tip-1", "acct-b", "acct-ada", "ada", "unsigned-local", 500L, "CNY", "thanks", false, AT);
    }

    @Test
    void aTipAnswers201WithTheRowTheAmountAndTheDefaultCap() {
        when(service.tip("acct-b", claim("acct-ada"), 500L, "thanks", false)).thenReturn(row());

        ResponseEntity<TipAnswer> res = controller.tip(new TipRequest("acct-b", claim("acct-ada"), 500L, "thanks", false));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        TipAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.recipientAccountId()).isEqualTo("acct-b");
        assertThat(answer.tips()).hasSize(1);
        Tip wire = answer.tips().get(0);
        assertThat(wire.recipientId()).isEqualTo("acct-b");
        assertThat(wire.amountCents()).isEqualTo(500L);
        assertThat(wire.message()).isEqualTo("thanks");
        assertThat(wire.anonymous()).isFalse();
        assertThat(wire.id()).isEqualTo("tip-1");
        assertThat(wire.payerId()).isEqualTo("acct-ada");
        assertThat(wire.currency()).isEqualTo("CNY");
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(wire.handle()).isEqualTo("ada");
        assertThat(wire.assurance()).isEqualTo("unsigned-local");
        assertThat(answer.totalCents()).isEqualTo(500L);
        assertThat(answer.count()).isEqualTo(1L);
        assertThat(answer.limit()).isEqualTo(TipService.DEFAULT_TIP_LIMIT);
    }

    @Test
    void aMissingAmountIsZeroNotANullAndAMissingAnonymousIsFalse() {
        when(service.tip("acct-b", claim("acct-ada"), 0L, "thanks", false)).thenReturn(row());

        controller.tip(new TipRequest("acct-b", claim("acct-ada"), null, "thanks", null));

        // A null amount is ZERO on the wire - the service refuses "more than nothing" by name, which is
        // a rule; a null reaching it as a Long would be a crash. Same for anonymous: Boolean.TRUE.equals
        // answers false for a null rather than dereferencing one.
        verify(service).tip("acct-b", claim("acct-ada"), 0L, "thanks", false);
    }

    @Test
    void aTrueAnonymousTravelsAsTrue() {
        when(service.tip("acct-b", claim("acct-ada"), 500L, "", true)).thenReturn(row());

        controller.tip(new TipRequest("acct-b", claim("acct-ada"), 500L, "", Boolean.TRUE));

        verify(service).tip("acct-b", claim("acct-ada"), 500L, "", true);
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        when(service.tip(null, null, 0L, null, false)).thenReturn(row());

        controller.tip(null);

        verify(service).tip(null, null, 0L, null, false);
    }

    @Test
    void theRecipientDirectionAsksWithTheRawCapAndClampsOnlyTheOffset() {
        when(service.tipsReceived("acct-b", 500, 0)).thenReturn(List.of(row()));
        when(service.totalReceived("acct-b")).thenReturn(1_500L);
        when(service.countReceived("acct-b")).thenReturn(9L);

        ResponseEntity<TipAnswer> res = controller.list("acct-b", null, 500, -3);

        // The cap travels RAW: the service's own clamp is the one clamp every door goes through, and the
        // answer echoes what was asked rather than what the service applied.
        verify(service).tipsReceived("acct-b", 500, 0);
        TipAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.limit()).isEqualTo(500);
        assertThat(answer.tips()).hasSize(1);
        // The total is the DATABASE's sum and the count is the WHOLE count - neither is the window's.
        assertThat(answer.totalCents()).isEqualTo(1_500L);
        assertThat(answer.count()).isEqualTo(9L);
    }

    @Test
    void aNonPositiveCapTravelsAsAsked() {
        when(service.tipsReceived("acct-b", 0, 0)).thenReturn(List.of());
        when(service.totalReceived("acct-b")).thenReturn(0L);
        when(service.countReceived("acct-b")).thenReturn(0L);

        controller.list("acct-b", null, 0, 0);

        // Zero is not this door's to rewrite: the service answers the default for it, one clamp in one
        // place, and the controller does not second-guess.
        verify(service).tipsReceived("acct-b", 0, 0);
    }

    @Test
    void thePayerDirectionAsksTheGivenSideAndAnswersWithTheGivenTotals() {
        when(service.tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0)).thenReturn(List.of(row()));
        when(service.totalGiven("acct-ada")).thenReturn(500L);
        when(service.countGiven("acct-ada")).thenReturn(1L);

        ResponseEntity<TipAnswer> res = controller.list(null, "acct-ada", null, null);

        verify(service).tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0);
        TipAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.recipientAccountId()).isEqualTo("acct-ada");
        assertThat(answer.totalCents()).isEqualTo(500L);
        assertThat(answer.count()).isEqualTo(1L);
    }

    @Test
    void aNegativeOffsetIsTheFirstWindowOnThePayerDirectionToo() {
        when(service.tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0)).thenReturn(List.of());
        when(service.totalGiven("acct-ada")).thenReturn(0L);
        when(service.countGiven("acct-ada")).thenReturn(0L);

        controller.list(null, "acct-ada", null, -5);

        verify(service).tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0);
    }

    @Test
    void aBlankRecipientFallsThroughToThePayerDirection() {
        when(service.tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0)).thenReturn(List.of());
        when(service.totalGiven("acct-ada")).thenReturn(0L);
        when(service.countGiven("acct-ada")).thenReturn(0L);

        controller.list("   ", "acct-ada", null, null);

        verify(service).tipsGiven("acct-ada", TipService.DEFAULT_TIP_LIMIT, 0);
    }

    @Test
    void aQuestionThatNamesNeitherRecipientNorPayerIsRefusedByName() {
        assertThatThrownBy(() -> controller.list(null, null, null, null))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("who received it")
                .hasMessageContaining("who gave it");
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidTip("a tip must be more than nothing"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-tip")
                .containsEntry("message", "a tip must be more than nothing");
    }
}
