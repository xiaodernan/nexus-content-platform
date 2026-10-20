package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * M7 v295 — ONE report: an account saying "this publication is a problem".
 *
 * <p>A report is APPENDED and never edited, exactly like a like and a comment: a report that could be
 * rewritten would be a report nobody could rely on, and the status is a small, forward-only set of facts
 * about what happened to it.
 *
 * <p>The UNIQUE constraint on (reporter, target, reason) is what stops one account filing the same
 * complaint a thousand times — and it is the DATABASE's rule, not the service's hope.
 */
@Entity
@Table(
        name = "report_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "report_entry_reporter_target_reason",
                columnNames = {"reporter_account_id", "target_project_id", "reason"}))
public class ReportEntry {

    /** The report's own id. A string, so the client can name it without learning about a sequence. */
    @Id
    @Column(name = "report_id", nullable = false, length = 64)
    private String reportId;

    /** The publication the report is about. */
    @Column(name = "target_project_id", nullable = false, length = 200)
    private String targetProjectId;

    /** The account that filed it. The claim's account id — never blank, or the report has no reporter. */
    @Column(name = "reporter_account_id", nullable = false, length = 200)
    private String reporterAccountId;

    /** The handle the claim carried, when it carried one. */
    @Column(name = "reporter_handle", length = 24)
    private String reporterHandle;

    /** What the claim was worth when it arrived. `unsigned-local` in this build. */
    @Column(name = "reporter_assurance", length = 32)
    private String reporterAssurance;

    /** WHY: one of the four the client declares. A closed set, so a reader can count by it. */
    @Column(name = "reason", nullable = false, length = 24)
    private String reason;

    /** The reporter's own words, verbatim. Empty is allowed: the reason alone is a report. */
    @Column(name = "detail", nullable = false, columnDefinition = "text")
    private String detail;

    /** Where the report is: open, reviewed, resolved or rejected. */
    @Column(name = "status", nullable = false, length = 24)
    private String status;

    /** When it was filed — the service's own instant, not the client's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ReportEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public ReportEntry(
            String reportId,
            String targetProjectId,
            String reporterAccountId,
            String reporterHandle,
            String reporterAssurance,
            String reason,
            String detail,
            String status,
            Instant createdAt) {
        this.reportId = reportId;
        this.targetProjectId = targetProjectId;
        this.reporterAccountId = reporterAccountId;
        this.reporterHandle = reporterHandle;
        this.reporterAssurance = reporterAssurance;
        this.reason = reason;
        this.detail = detail;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getReportId() {
        return reportId;
    }

    public String getTargetProjectId() {
        return targetProjectId;
    }

    public String getReporterAccountId() {
        return reporterAccountId;
    }

    public String getReporterHandle() {
        return reporterHandle;
    }

    public String getReporterAssurance() {
        return reporterAssurance;
    }

    public String getReason() {
        return reason;
    }

    public String getDetail() {
        return detail;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * The one status move this build supports: the REPORTER withdraws their own open report.
     *
     * <p>The row STAYS. A report that was withdrawn is a fact that happened, exactly as a publication that
     * was taken down is — and “rejected” here means "the reporter no longer stands by it", which is
     * stated in the service’s own words rather than left to be inferred.
     */
    public void markRejected() {
        this.status = "rejected";
    }

    /**
     * v304 — the other status move this build supports: the OWNER of the reported publication says they
     * have seen the report.
     *
     * <p>The move is FORWARD and the row STAYS, for the same reason the withdrawal's does: a report that
     * was acknowledged is a fact that happened. The status is called {@code acknowledged} rather than
     * {@code reviewed} or {@code resolved} because those two are a moderator's words, and this build has
     * no moderator to render them.
     */
    public void markAcknowledged() {
        this.status = "acknowledged";
    }
}
