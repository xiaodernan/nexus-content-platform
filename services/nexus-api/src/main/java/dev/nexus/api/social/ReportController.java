package dev.nexus.api.social;

import dev.nexus.api.social.ReportDtos.Report;
import dev.nexus.api.social.ReportDtos.ReportAnswer;
import dev.nexus.api.social.ReportDtos.ReportClaim;
import dev.nexus.api.social.ReportDtos.ReportRequest;
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
 * M7 v295 — the HTTP surface for REPORTS.
 *
 * <p>Three doors: file one, withdraw one, and read the ones about a publication. The claim travels in the
 * body (filing) or as a query parameter (withdrawing), and the refusals are translated into the status
 * codes that carry the difference — 400 for a request that broke a rule, 403 for one that was understood
 * and refused.
 */
@RestController
@RequestMapping("/reports")
public class ReportController {

    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    /** File a report. 201 when it was new. */
    @PostMapping
    public ResponseEntity<ReportAnswer> report(@RequestBody ReportRequest request) {
        ReportEntry row = service.report(
                request == null ? null : request.projectId(),
                request == null ? null : request.claim(),
                request == null ? null : request.reason(),
                request == null ? null : request.detail());
        return ResponseEntity.status(201).body(new ReportAnswer(
                row.getTargetProjectId(),
                List.of(toWire(row)),
                1,
                ReportService.DEFAULT_REPORT_LIMIT));
    }

    /**
     * Withdraw a report. 200 either way: a report that is already gone is "already gone", not an error,
     * because the URL names a report rather than a resource that must exist.
     */
    @DeleteMapping("/{reportId}")
    public ResponseEntity<Map<String, Object>> withdraw(
            @PathVariable String reportId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        ReportClaim claim = claimerAccountId == null ? null : new ReportClaim(claimerAccountId, null, null, null);
        boolean withdrawn = service.withdraw(reportId, claim);
        return ResponseEntity.ok(Map.of("ok", true, "reportId", reportId, "withdrawn", withdrawn));
    }

    /** The reports about one publication, and how many there are. */
    @GetMapping
    public ResponseEntity<ReportAnswer> list(
            @RequestParam(name = "target") String targetProjectId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? ReportService.DEFAULT_REPORT_LIMIT : limit;
        List<ReportEntry> rows = service.reportsOf(targetProjectId, asked);
        List<Report> reports = rows.stream().map(ReportController::toWire).toList();
        return ResponseEntity.ok(new ReportAnswer(
                rows.isEmpty() ? targetProjectId : rows.get(0).getTargetProjectId(),
                reports,
                reports.size(),
                asked));
    }

    /** The service's row, as the wire's shape. */
    private static Report toWire(ReportEntry row) {
        return new Report(
                row.getReportId(),
                row.getReporterAccountId(),
                row.getTargetProjectId(),
                row.getReason(),
                row.getDetail(),
                row.getStatus(),
                row.getCreatedAt().toEpochMilli(),
                row.getReporterHandle(),
                row.getReporterAssurance());
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidReport.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidReport e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-report", "message", e.getMessage()));
    }

    /**
     * Somebody else's report is 403, not 400: the request was well-formed, so a 400 would tell the
     * caller to fix a field that is fine.
     */
    @ExceptionHandler(NotYourReport.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourReport e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-report", "message", e.getMessage()));
    }
}
