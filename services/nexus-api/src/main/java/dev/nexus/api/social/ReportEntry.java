package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M7 v295 — ONE report: an account saying "this publication is a problem".
 *
 * <p>A report is APPENDED and never edited, exactly like a like and a comment: a report that could be
 * rewritten would be a report nobody could rely on, and the status is a small, forward-only set of facts
 * about what happened to it.
 *
 * <p><b>v383 — the uniqueness rule is TIME-AWARE, so the DATABASE's constraint is gone.</b> A report STANDS
 * for a period (a month, as filed today) and then expires; an expired report no longer constrains a second
 * one, so the same account may say the same thing again once the first has lapsed. "At most one STANDING
 * report per (reporter, target, reason)" is a rule about a moving instant, and a UNIQUE index cannot
 * express one — so the rule now lives in the service ({@code ReportService.report}), which checks for a
 * STANDING report before it files a new one. What is lost by the move is named rather than pretended: two
 * simultaneous filings can both pass the check and both land, where the constraint would have stopped the
 * second. A database-level rule that only counts standing rows needs a trigger or a migration tool, and
 * this build has neither yet (the README's ddl-auto bound) — that is the honest next step, not a reason to
 * keep a constraint that refuses the re-file the rule now allows.
 */
@Entity
@Table(name = "report_entry")
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

    /**
     * v383 — how long this report STANDS: the closed set of two, {@code month} or {@code year}.
     *
     * <p>Read off the ROW and not off today's policy: a report filed when the standing period was a month
     * expires a month later even if the service's policy has since moved. The service writes {@code month}
     * today; the column is the row's own memory of the terms it was filed under.
     */
    @Column(name = "period", nullable = false, length = 16)
    private String period;

    /**
     * v384 — what KIND of thing this report is about: {@code account}, {@code plan} or {@code publication}.
     *
     * <p>A CLOSED SET of three, the same one the audit trail speaks (the trail's own
     * {@code target_type}). Reports are about PUBLICATIONS today — the request names a project id — and
     * the column exists so the filed list can be narrowed by kind and so a future report about an account
     * or a plan has somewhere honest to say so. Declared by the caller, never guessed from an id.
     */
    @Column(name = "target_type", nullable = false, length = 16)
    private String targetType;

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
            String period,
            String targetType,
            Instant createdAt) {
        this.reportId = reportId;
        this.targetProjectId = targetProjectId;
        this.reporterAccountId = reporterAccountId;
        this.reporterHandle = reporterHandle;
        this.reporterAssurance = reporterAssurance;
        this.reason = reason;
        this.detail = detail;
        this.status = status;
        this.period = period;
        this.targetType = targetType;
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

    /** v383 — the period this report stands for, as filed. */
    public String getPeriod() {
        return period;
    }

    /** v384 — the kind of thing this report is about. */
    public String getTargetType() {
        return targetType;
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
