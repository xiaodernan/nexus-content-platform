package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.ReportDtos.FiledReportsAnswer;
import dev.nexus.api.social.ReportDtos.Report;
import dev.nexus.api.social.ReportDtos.ReportAnswer;
import dev.nexus.api.social.ReportDtos.ReportClaim;
import dev.nexus.api.social.ReportDtos.ReportRequest;
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
 * M7 v422 - the HTTP surface for REPORTS, graded directly.
 *
 * <p>Three doors: file one, withdraw one, and read the ones about a publication (or, with {@code
 * reporter}, the ones ONE ACCOUNT filed). What THIS file grades is the controller's own decisions, and
 * this door carries the sharpest asymmetry of them all: the FILED direction pages and the TARGET
 * direction does not - an offset asked on the target direction is ignored entirely, because the target
 * finder takes no offset at all. Two more edges are pinned rather than smoothed: the filed answer TRIMS
 * the reporter it echoes while asking the service with the raw string, and the wire shape carries no
 * reporter identity at all (v307 - a report is a complaint, not an accusation with the complainant's
 * name on it).
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the four
 * controller tests before this one follow.
 */
@ExtendWith(MockitoExtension.class)
class ReportControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private ReportService service;

    private ReportController controller;

    @BeforeEach
    void setUp() {
        controller = new ReportController(service);
    }

    private static ReportClaim claim(String accountId) {
        return new ReportClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static ReportEntry row(String id) {
        return new ReportEntry(
                id, "pub-1", "acct-ada", "ada", "unsigned-local",
                "spam", "it is an ad", "standing", "2026-10", "publication", AT);
    }

    @Test
    void aFiledReportAnswers201WithTheRowTheCountOfOneAndTheDefaultCap() {
        when(service.report("pub-1", claim("acct-ada"), "spam", "it is an ad")).thenReturn(row("rep-1"));

        ResponseEntity<ReportAnswer> res = controller.report(new ReportRequest("pub-1", claim("acct-ada"), "spam", "it is an ad"));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        ReportAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.projectId()).isEqualTo("pub-1");
        assertThat(answer.reports()).hasSize(1);
        Report wire = answer.reports().get(0);
        assertThat(wire.id()).isEqualTo("rep-1");
        assertThat(wire.targetId()).isEqualTo("pub-1");
        assertThat(wire.reason()).isEqualTo("spam");
        assertThat(wire.detail()).isEqualTo("it is an ad");
        assertThat(wire.status()).isEqualTo("standing");
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(answer.count()).isEqualTo(1);
        assertThat(answer.limit()).isEqualTo(ReportService.DEFAULT_REPORT_LIMIT);
    }

    @Test
    void theWireCarriesNoReporterIdentityAtAll() {
        // v307 - the service STORES the reporter (the withdrawal compares it with the row), but the wire
        // does not carry it: a report is a complaint, not an accusation with the complainant's name on
        // it. Six components, and none of them is the reporter's.
        assertThat(Report.class.getRecordComponents()).hasSize(6);
        assertThat(Report.class.getRecordComponents())
                .noneMatch(c -> c.getName().toLowerCase().contains("reporter"));
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        when(service.report(null, null, null, null)).thenReturn(row("rep-1"));

        controller.report(null);

        verify(service).report(null, null, null, null);
    }

    @Test
    void theWithdrawClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.withdraw("rep-1", new ReportClaim("acct-ada", null, null, null))).thenReturn(true);

        ResponseEntity<Map<String, Object>> res = controller.withdraw("rep-1", "acct-ada");

        ArgumentCaptor<ReportClaim> captor = ArgumentCaptor.forClass(ReportClaim.class);
        verify(service).withdraw(eq("rep-1"), captor.capture());
        ReportClaim asked = captor.getValue();
        assertThat(asked.accountId()).isEqualTo("acct-ada");
        assertThat(asked.handle()).isNull();
        assertThat(asked.assurance()).isNull();
        assertThat(asked.claimedAt()).isNull();
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody())
                .containsEntry("ok", true)
                .containsEntry("reportId", "rep-1")
                .containsEntry("withdrawn", true);
    }

    @Test
    void aWithdrawWithNoClaimerAsksWithNoClaim() {
        when(service.withdraw("rep-1", null)).thenReturn(false);

        controller.withdraw("rep-1", null);

        verify(service).withdraw("rep-1", null);
    }

    @Test
    void anAlreadyGoneReportAnswers200WithWithdrawnFalse() {
        when(service.withdraw("rep-1", new ReportClaim("acct-ada", null, null, null))).thenReturn(false);

        ResponseEntity<Map<String, Object>> res = controller.withdraw("rep-1", "acct-ada");

        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).containsEntry("withdrawn", false);
    }

    @Test
    void theFiledDirectionPagesAndTrimsTheReporterOnTheAnswer() {
        when(service.reportsFiledBy("  acct-ada  ", 0, 500, "account")).thenReturn(List.of(row("rep-1")));
        when(service.countFiledBy("  acct-ada  ")).thenReturn(9L);

        ResponseEntity<?> res = controller.list(null, "  acct-ada  ", 500, "account", -3);

        // The offset travels clamped (a page before the first is the first) and the cap travels raw,
        // the same policy the tips door keeps - one clamp, in the service, for every door.
        verify(service).reportsFiledBy("  acct-ada  ", 0, 500, "account");
        assertThat(res.getBody()).isInstanceOf(FiledReportsAnswer.class);
        FiledReportsAnswer answer = (FiledReportsAnswer) res.getBody();
        // The ANSWER trims what the ASK did not: the echo is the clean name, and the service was asked
        // with exactly what the caller typed.
        assertThat(answer.reporterAccountId()).isEqualTo("acct-ada");
        assertThat(answer.count()).isEqualTo(9);
        assertThat(answer.limit()).isEqualTo(500);
        assertThat(answer.reports()).hasSize(1);
    }

    @Test
    void theTargetDirectionDoesNotPageEvenWhenAnOffsetIsAsked() {
        when(service.reportsOf("pub-1", 20)).thenReturn(List.of(row("rep-1")));

        controller.list("pub-1", null, null, null, 40);

        // The asymmetry, pinned: the target finder takes no offset at all, so an offset asked here is
        // ignored rather than half-honoured. The filed direction pages; this one does not.
        verify(service).reportsOf("pub-1", 20);
    }

    @Test
    void theTargetAnswerNamesTheAskedProjectWhenThereAreNoRows() {
        when(service.reportsOf("pub-1", 20)).thenReturn(List.of());

        ResponseEntity<?> res = controller.list("pub-1", null, null, null, null);

        assertThat(res.getBody()).isInstanceOf(ReportAnswer.class);
        ReportAnswer answer = (ReportAnswer) res.getBody();
        // No row to name the project, so the ASK names it - an answer about nothing still says what it
        // is about.
        assertThat(answer.projectId()).isEqualTo("pub-1");
        assertThat(answer.count()).isZero();
    }

    @Test
    void theTargetAnswerCountsTheWindowItCarried() {
        when(service.reportsOf("pub-1", 20)).thenReturn(List.of(row("rep-1"), row("rep-2")));

        ResponseEntity<?> res = controller.list("pub-1", null, null, null, null);

        ReportAnswer answer = (ReportAnswer) res.getBody();
        // The count is the window's own size, not a whole-table count - this direction has no second
        // number, and pretending otherwise would be the lie v355 retired on the other doors.
        assertThat(answer.count()).isEqualTo(2);
        assertThat(answer.projectId()).isEqualTo("pub-1");
    }

    @Test
    void aBlankReporterFallsThroughToTheTargetDirection() {
        when(service.reportsOf("pub-1", 20)).thenReturn(List.of());

        controller.list("pub-1", "   ", null, null, null);

        verify(service).reportsOf("pub-1", 20);
    }

    @Test
    void aQuestionThatNamesNeitherTargetNorReporterIsA400ThatNamesBoth() {
        ResponseEntity<?> res = controller.list(null, null, null, null, null);

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody()).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) res.getBody();
        assertThat(body).containsEntry("error", "invalid-report");
        assertThat(body.get("message")).contains("target").contains("reporter");
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidReport("a report needs a reason"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-report")
                .containsEntry("message", "a report needs a reason");
    }

    @Test
    void somebodyElsesReportIsA403NotA400() {
        ResponseEntity<Map<String, String>> res = controller.notYours(new NotYourReport("that report is not yours"));

        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody())
                .containsEntry("error", "not-your-report")
                .containsEntry("message", "that report is not yours");
    }
}
