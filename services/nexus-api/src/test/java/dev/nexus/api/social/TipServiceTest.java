package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.TipDtos.TipClaim;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * The four rules {@link TipService} owns, and the two behaviours that are not rules: the total (summed by
 * the DATABASE) and the window.
 *
 * <p>No Spring context and no database here on purpose — these cases are about what the service decides.
 * The clock is PINNED, so the instant a tip records is asserted rather than read back and compared to
 * itself.
 */
@ExtendWith(MockitoExtension.class)
class TipServiceTest {

    private static final Instant AT = Instant.parse("2026-10-21T10:00:00Z");

    @Mock
    private TipRepository repository;

    private TipService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new TipService(repository, clock);
    }

    private static TipClaim claim(String accountId) {
        return new TipClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    // ── rule 1: a tip needs a RECIPIENT and a PAYER ─────────────────────────────────────────────

    @Test
    void aTipWithNoRecipientIsREFUSEDByName() {
        assertThatThrownBy(() -> service.tip(null, claim("acct-ada"), 500, "", false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("needs an account to be for");
        verify(repository, never()).save(any());
    }

    @Test
    void aTipWithNoPayerIsREFUSEDByName() {
        assertThatThrownBy(() -> service.tip("acct-bob", null, 500, "", false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("needs an account to be from");
        verify(repository, never()).save(any());
    }

    // ── rule 2: the amount is POSITIVE and CAPPED ────────────────────────────────────────────────

    @Test
    void aTipOfZEROIsREFUSEDAndTheRefusalSaysWhy() {
        assertThatThrownBy(() -> service.tip("acct-bob", claim("acct-ada"), 0, "", false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("zero is not a tip");
    }

    @Test
    void aNEGATIVETipIsREFUSEDAndTheRefusalSaysWhy() {
        // An amount below zero is money moving the wrong way round, and a service that stored it would
        // hold a number nobody could defend.
        assertThatThrownBy(() -> service.tip("acct-bob", claim("acct-ada"), -500, "", false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("cannot be negative")
                .hasMessageContaining("wrong way round");
    }

    @Test
    void anAbsurdAmountIsREFUSEDWithTheCapNamed() {
        assertThatThrownBy(() -> service.tip("acct-bob", claim("acct-ada"), TipService.MAX_TIP_CENTS + 1, "", false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("at most " + TipService.MAX_TIP_CENTS + " cents");
    }

    // ── rule 3: the message is bounded ───────────────────────────────────────────────────────────

    @Test
    void aHugeMessageIsREFUSEDWithTheLimitNamed() {
        String huge = "x".repeat(TipService.MAX_MESSAGE_LENGTH + 1);
        assertThatThrownBy(() -> service.tip("acct-bob", claim("acct-ada"), 500, huge, false))
                .isInstanceOf(InvalidTip.class)
                .hasMessageContaining("at most " + TipService.MAX_MESSAGE_LENGTH + " characters");
    }

    @Test
    void anEmptyMessageIsAllowed_andAnAmountWithNoNoteIsStillATip() {
        when(repository.save(any(TipEntry.class))).thenAnswer(i -> i.getArgument(0));

        TipEntry row = service.tip("acct-bob", claim("acct-ada"), 500, "", false);

        assertThat(row.getMessage()).isEmpty();
    }

    // ── rule 4: the amount is recorded as it was ────────────────────────────────────────────────

    @Test
    void theTipRecordsTheAmountTheServiceWasGivenAndTheSERVICEsInstant() {
        when(repository.save(any(TipEntry.class))).thenAnswer(i -> i.getArgument(0));

        TipEntry row = service.tip("acct-bob", claim("acct-ada"), 500, "nice work", false);

        assertThat(row.getAmountCents()).isEqualTo(500L);
        assertThat(row.getCurrency()).isEqualTo("CNY");
        assertThat(row.getCreatedAt()).isEqualTo(AT);
        assertThat(row.getPayerHandle()).isEqualTo("ada");
        assertThat(row.getPayerAssurance()).isEqualTo("unsigned-local");
        assertThat(row.isAnonymous()).isFalse();
    }

    @Test
    void anAnonymousTipIsRecordedAsAnonymous() {
        when(repository.save(any(TipEntry.class))).thenAnswer(i -> i.getArgument(0));

        TipEntry row = service.tip("acct-bob", claim("acct-ada"), 500, "", true);

        assertThat(row.isAnonymous()).isTrue();
    }

    // ── the read ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theTipsAnAccountReceivedCarryTheRowsAndTheTotal() {
        TipEntry one = new TipEntry(
                "t-1", "acct-bob", "acct-ada", "ada", "unsigned-local", 500L, "CNY", "nice", false, AT);
        when(repository.findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of(one));
        when(repository.sumAmountCentsByRecipientAccountId("acct-bob")).thenReturn(1500L);
        when(repository.countByRecipientAccountId("acct-bob")).thenReturn(3L);

        assertThat(service.tipsReceived("acct-bob", 20, 0)).containsExactly(one);
        // The total is summed by the DATABASE, so it is a fact about the rows and not a running total the
        // service kept in its head.
        assertThat(service.totalReceived("acct-bob")).isEqualTo(1500L);
        assertThat(service.countReceived("acct-bob")).isEqualTo(3L);
    }

    // ── v332: the tips one account GAVE ───────────────────────────

    @Test
    void theTipsOneAccountGaveAreReadNewestFirst() {
        // The other side of the same relation, and the same question the subscription had (v310): "what do
        // I back" and "who backs me" are not the same question. The repository has had the finder since
        // v298 without a service method or a door for it.
        TipEntry given = new TipEntry(
                "t-1", "acct-ada", "acct-bob", "bob", "unsigned-local", 500L, "CNY", "nice", false, AT);
        when(repository.findByPayerAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of(given));

        assertThat(service.tipsGiven("acct-bob", 20, 0)).containsExactly(given);
    }

    @Test
    void theTotalGivenIsSummedByTheDATABASE() {
        // A total the service added up in memory would be the sum of a WINDOW, and a window's sum is not a
        // total.
        when(repository.sumAmountCentsByPayerAccountId("acct-bob")).thenReturn(1500L);

        assertThat(service.totalGiven("acct-bob")).isEqualTo(1500L);
    }

    // ── v355: the GIVING side is counted over the WHOLE table ────────────────────────

    @Test
    void theGivingSideIsCountedOverTheWholeTable() {
        // A receipt that says "2 tip(s)" when the payer gave twenty is a receipt about a window. The
        // count is the DATABASE's count, over every row the payer has ever tipped.
        when(repository.countByPayerAccountId("acct-bob")).thenReturn(20L);

        assertThat(service.countGiven("acct-bob")).isEqualTo(20L);
    }

    @Test
    void theGivingSideNeedsAnAccount() {
        assertThatThrownBy(() -> service.countGiven("  ")).isInstanceOf(InvalidTip.class);
    }

    @Test
    void theLimitIsClampedRatherThanRefused() {
        when(repository.findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.tipsReceived("acct-bob", 10_000, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(TipService.MAX_TIP_LIMIT);
    }

    @Test
    void readingTheTipsNeedsAnAccountToo() {
        assertThatThrownBy(() -> service.tipsReceived("  ", 20, 0)).isInstanceOf(InvalidTip.class);
    }

    // ── v391: the tips windows can be PAGED, in rows ──────────────────────────────────────────

    @Test
    void theReceivedWindowCanBePagedInRows() {
        // v391 — the tips a creator was given are a WINDOW, and a window nobody can page is the whole
        // list to a creator with more tips than the cap. The offset is ROWS: asking for the rows from 20
        // on is page 1 of a 20-row window, which is what the captor below pins.
        when(repository.findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.tipsReceived("acct-bob", 20, 20);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(1);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void theReceivedOffsetIsROWSNotAPageIndex() {
        // v387's lesson, applied from the start: the offset means ROWS, and Spring Data's PageRequest
        // speaks PAGES. Asking for the rows from 40 on must be answered with page 2 (rows 40–59) —
        // not page 40 (rows 800–819), which is what handing the raw number to PageRequest.of answers.
        when(repository.findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.tipsReceived("acct-bob", 20, 40);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(2);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void theGivenWindowCanBePagedInRowsToo() {
        // The payer's receipt gets the same translation: the other direction of the same relation is
        // paged the same way, or a reader with a long receipt could not read its tail.
        when(repository.findByPayerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());

        service.tipsGiven("acct-ada", 20, 20);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPayerAccountIdOrderByCreatedAtDesc(eq("acct-ada"), window.capture());
        assertThat(window.getValue().getPageNumber()).isEqualTo(1);
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void aNegativeTipsOffsetIsTheFirstWindow() {
        // A page before the first does not exist; the newest rows are the honest answer, not a refusal.
        when(repository.findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.tipsReceived("acct-bob", 20, -5);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByRecipientAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageNumber()).isZero();
    }
}
