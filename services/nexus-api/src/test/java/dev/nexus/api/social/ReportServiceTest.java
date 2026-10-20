package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.ReportDtos.ReportClaim;
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
 * The four rules {@link ReportService} owns, and the two behaviours that are not rules: the visible
 * count, and the "already withdrawn" answer.
 *
 * <p>No Spring context and no database here on purpose — these cases are about what the service decides.
 * The clock is PINNED, so the instant a report records is asserted rather than read back and compared to
 * itself.
 */
@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    private static final Instant AT = Instant.parse("2026-10-21T09:00:00Z");

    @Mock
    private ReportRepository repository;

    private ReportService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new ReportService(repository, clock);
    }

    private static ReportClaim claim(String accountId) {
        return new ReportClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    // ── rule 1: a report needs an ACCOUNT ──────────────────────────────────────────────────────────

    @Test
    void aReportWithNoClaimIsREFUSEDByName() {
        assertThatThrownBy(() -> service.report("pub-1", null, "spam", ""))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("needs an account")
                .hasMessageContaining("cannot be followed up");
        verify(repository, never()).save(any());
    }

    @Test
    void aReportWithABlankAccountIsREFUSEDTheSameWay() {
        assertThatThrownBy(() -> service.report("pub-1", claim("   "), "spam", ""))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("needs an account");
    }

    // ── rule 2: the reason is one of FOUR ──────────────────────────────────────────────────────────

    @Test
    void eachOfTheFourReasonsIsACCEPTED() {
        for (String reason : List.of("spam", "harassment", "illegal", "other")) {
            when(repository.findByReporterAccountIdAndTargetProjectIdAndReason("acct-ada", "pub-1", reason))
                    .thenReturn(Optional.empty());
            when(repository.save(any(ReportEntry.class))).thenAnswer(i -> i.getArgument(0));

            ReportEntry row = service.report("pub-1", claim("acct-ada"), reason, "");

            assertThat(row.getReason()).isEqualTo(reason);
            assertThat(row.getStatus()).isEqualTo("open");
        }
    }

    @Test
    void aReasonOUTSIDETheFourIsREFUSEDAndTheRefusalNAMESThem() {
        assertThatThrownBy(() -> service.report("pub-1", claim("acct-ada"), "because", ""))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("spam, harassment, illegal, other");
        verify(repository, never()).save(any());
    }

    @Test
    void aBlankReasonIsREFUSED() {
        assertThatThrownBy(() -> service.report("pub-1", claim("acct-ada"), "  ", ""))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("needs a reason");
    }

    // ── rule 3: the detail is bounded ───────────────────────────────────────────────────────────

    @Test
    void aHugeDetailIsREFUSEDWithTheLimitNamed() {
        String huge = "x".repeat(ReportService.MAX_DETAIL_LENGTH + 1);
        assertThatThrownBy(() -> service.report("pub-1", claim("acct-ada"), "spam", huge))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("at most " + ReportService.MAX_DETAIL_LENGTH + " characters");
    }

    @Test
    void anEmptyDetailIsAllowed_andTheReasonAloneIsAReport() {
        when(repository.findByReporterAccountIdAndTargetProjectIdAndReason("acct-ada", "pub-1", "spam"))
                .thenReturn(Optional.empty());
        when(repository.save(any(ReportEntry.class))).thenAnswer(i -> i.getArgument(0));

        ReportEntry row = service.report("pub-1", claim("acct-ada"), "spam", "");

        assertThat(row.getDetail()).isEmpty();
    }

    // ── rule 4: the same account cannot report the same thing twice ─────────────────────────────

    @Test
    void aSECONDReportForTheSameReasonIsREFUSEDByName() {
        when(repository.findByReporterAccountIdAndTargetProjectIdAndReason("acct-ada", "pub-1", "spam"))
                .thenReturn(Optional.of(new ReportEntry(
                        "r-1", "pub-1", "acct-ada", "ada", "unsigned-local", "spam", "", "open", AT)));

        assertThatThrownBy(() -> service.report("pub-1", claim("acct-ada"), "spam", "again"))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("already reported");
        verify(repository, never()).save(any());
    }

    @Test
    void aDIFFERENTReasonIsNotADuplicate() {
        when(repository.findByReporterAccountIdAndTargetProjectIdAndReason("acct-ada", "pub-1", "illegal"))
                .thenReturn(Optional.empty());
        when(repository.save(any(ReportEntry.class))).thenAnswer(i -> i.getArgument(0));

        ReportEntry row = service.report("pub-1", claim("acct-ada"), "illegal", "");

        assertThat(row.getReason()).isEqualTo("illegal");
    }

    // ── the report records the service's own facts ──────────────────────────────────────────────

    @Test
    void theReportRecordsTheSERVICEsInstantAndTheClaim() {
        when(repository.findByReporterAccountIdAndTargetProjectIdAndReason("acct-ada", "pub-1", "spam"))
                .thenReturn(Optional.empty());
        when(repository.save(any(ReportEntry.class))).thenAnswer(i -> i.getArgument(0));

        ReportEntry row = service.report("pub-1", claim("acct-ada"), "spam", "a detail");

        assertThat(row.getCreatedAt()).isEqualTo(AT);
        assertThat(row.getReporterHandle()).isEqualTo("ada");
        assertThat(row.getReporterAssurance()).isEqualTo("unsigned-local");
        assertThat(row.getStatus()).isEqualTo("open");
        assertThat(row.getReportId()).isNotBlank();
    }

    // ── the withdrawal ───────────────────────────────────────────────────────────────────────────

    @Test
    void withdrawingYourOwnOpenReportMarksItRejectedAndKeepsTheRow() {
        ReportEntry mine = new ReportEntry(
                "r-1", "pub-1", "acct-ada", "ada", "unsigned-local", "spam", "", "open", AT);
        when(repository.findByReportId("r-1")).thenReturn(Optional.of(mine));
        when(repository.save(any(ReportEntry.class))).thenAnswer(i -> i.getArgument(0));

        boolean withdrawn = service.withdraw("r-1", claim("acct-ada"));

        assertThat(withdrawn).isTrue();
        assertThat(mine.getStatus()).isEqualTo("rejected");
        // The row STAYS: a report that was withdrawn is a fact that happened.
        verify(repository, times(1)).save(mine);
    }

    @Test
    void withdrawingSomebodyElsesReportIsREFUSEDAndChangesNothing() {
        when(repository.findByReportId("r-1")).thenReturn(Optional.of(new ReportEntry(
                "r-1", "pub-1", "acct-someone-else", "bob", "unsigned-local", "spam", "", "open", AT)));

        assertThatThrownBy(() -> service.withdraw("r-1", claim("acct-ada")))
                .isInstanceOf(NotYourReport.class)
                .hasMessageContaining("only its reporter may withdraw it");
        verify(repository, never()).save(any());
    }

    @Test
    void withdrawingAReportThatIsAlreadyWithdrawnIsALREADY_WITHDRAWNAndNotAFailure() {
        when(repository.findByReportId("r-1")).thenReturn(Optional.of(new ReportEntry(
                "r-1", "pub-1", "acct-ada", "ada", "unsigned-local", "spam", "", "rejected", AT)));

        assertThat(service.withdraw("r-1", claim("acct-ada"))).isFalse();
        verify(repository, never()).save(any());
    }

    @Test
    void withdrawingAReportThatDoesNotExistIsALREADY_WITHDRAWN() {
        when(repository.findByReportId("r-none")).thenReturn(Optional.empty());
        assertThat(service.withdraw("r-none", claim("acct-ada"))).isFalse();
    }

    // ── the read ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theReportsOfAPublicationCarryTheCountAndAreCapped() {
        ReportEntry one = new ReportEntry(
                "r-1", "pub-1", "acct-ada", "ada", "unsigned-local", "spam", "", "open", AT);
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of(one));
        when(repository.countByTargetProjectId("pub-1")).thenReturn(4L);

        assertThat(service.reportsOf("pub-1", 20)).containsExactly(one);
        assertThat(service.countOf("pub-1")).isEqualTo(4L);
    }

    @Test
    void theLimitIsClampedRatherThanRefused() {
        when(repository.findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), any(Pageable.class)))
                .thenReturn(List.of());

        service.reportsOf("pub-1", 10_000);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByTargetProjectIdOrderByCreatedAtDesc(eq("pub-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(ReportService.MAX_REPORT_LIMIT);
    }

    // ── v305: the reports ONE ACCOUNT filed — the other direction of the report ────────────────────

    @Test
    void theReportsAnAccountFiledAreReadThroughTheRepositorysOwnFinder() {
        when(repository.findByReporterAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.reportsFiledBy("acct-bob", 20);

        verify(repository).findByReporterAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class));
    }

    @Test
    void aReadWithNoAccountIsREFUSEDByName() {
        assertThatThrownBy(() -> service.reportsFiledBy(null, 20))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("need that account to be named");
        assertThatThrownBy(() -> service.reportsFiledBy("   ", 20))
                .isInstanceOf(InvalidReport.class)
                .hasMessageContaining("need that account to be named");
    }

    @Test
    void theFiledListIsCapped() {
        when(repository.findByReporterAccountIdOrderByCreatedAtDesc(eq("acct-bob"), any(Pageable.class)))
                .thenReturn(List.of());

        service.reportsFiledBy("acct-bob", 10_000);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByReporterAccountIdOrderByCreatedAtDesc(eq("acct-bob"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(ReportService.MAX_REPORT_LIMIT);
    }
}
