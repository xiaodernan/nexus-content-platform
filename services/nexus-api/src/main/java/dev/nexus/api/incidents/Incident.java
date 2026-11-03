package dev.nexus.api.incidents;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M9 v594 — ONE incident: something went wrong, written down when it was noticed.
 *
 * <p>The row is a RECORD with a life, not a status page. It is opened once, by a caller, with the words
 * that caller chose, and it stays open until somebody resolves it. Nothing in this service detects an
 * incident, assigns one, grades its severity against evidence, or transitions it any way other than
 * {@link #resolve}. The two statuses are therefore exactly {@code open} and {@code resolved}, and there is
 * no path back: a record that was resolved keeps its resolver and its instant even if the problem returns.
 * A recurrence is a NEW incident, which is the honest shape of "it happened again".
 *
 * <p>Two pairs of nullable columns state two deliberate absences:
 *
 * <ul>
 *   <li>{@code targetKind}/{@code targetId} — what this incident is ABOUT, when the opener knows. The
 *       service stores the pair and never dereferences it: it does not check that the publication, tool or
 *       project named here exists. A target is a claim by the opener, and the id is as opaque as every
 *       other host-declared id in this service.
 *   <li>{@code resolvedBy}/{@code resolvedAt} — who resolved it and when the service recorded it. Both
 *       are null until {@link #resolve}, and both are set together, so a row can never be half-resolved.
 * </ul>
 *
 * <p>No audit entry and no webhook delivery is written for a transition: this table IS the record, and a
 * second copy in the trail would be a second answer to the same question. The live proof reads zero audit
 * entries and zero deliveries after four opens and one resolve.
 */
@Entity
@Table(name = "incident")
public class Incident {

    /** The incident's own id — minted here, never chosen by the caller. */
    @Id
    @Column(name = "incident_id", nullable = false, length = 64)
    private String incidentId;

    /** What happened, in the opener's words. Trimmed, 1..120. */
    @Column(name = "title", nullable = false, length = 120)
    private String title;

    /** The longer account, when one was given. Null when the opener said nothing more. */
    @Column(name = "summary", length = 2000)
    private String summary;

    /** One of {@code low|medium|high|critical}, exactly as the opener spelled it. A CLAIM, not a verdict. */
    @Column(name = "severity", nullable = false, length = 20)
    private String severity;

    /** The KIND of thing this is about, when a target was named. Stored, never resolved. */
    @Column(name = "target_kind", length = 40)
    private String targetKind;

    /** The thing's id, opaque to this service. Present exactly when {@code targetKind} is. */
    @Column(name = "target_id", length = 200)
    private String targetId;

    /** {@code open} or {@code resolved}; the service is the only writer of this word. */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /** Who opened it, when the caller said. Host-declared and opaque like every account id. */
    @Column(name = "opened_by", length = 120)
    private String openedBy;

    /** When the service recorded the open — its own instant, never the caller's. */
    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    /** Who resolved it; null until resolved, and set together with {@code resolvedAt}. */
    @Column(name = "resolved_by", length = 120)
    private String resolvedBy;

    /** When the service recorded the resolve; null until resolved. */
    @Column(name = "resolved_at")
    private Instant resolvedAt;

    protected Incident() {
        // JPA needs it; the service never builds one without values.
    }

    public Incident(
            String incidentId,
            String title,
            String summary,
            String severity,
            String targetKind,
            String targetId,
            String status,
            String openedBy,
            Instant openedAt) {
        this.incidentId = incidentId;
        this.title = title;
        this.summary = summary;
        this.severity = severity;
        this.targetKind = targetKind;
        this.targetId = targetId;
        this.status = status;
        this.openedBy = openedBy;
        this.openedAt = openedAt;
    }

    public String getIncidentId() {
        return incidentId;
    }

    public String getTitle() {
        return title;
    }

    public String getSummary() {
        return summary;
    }

    public String getSeverity() {
        return severity;
    }

    public String getTargetKind() {
        return targetKind;
    }

    public String getTargetId() {
        return targetId;
    }

    public String getStatus() {
        return status;
    }

    public String getOpenedBy() {
        return openedBy;
    }

    public Instant getOpenedAt() {
        return openedAt;
    }

    public String getResolvedBy() {
        return resolvedBy;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    /**
     * Close this record: the resolver and the instant are written TOGETHER, and the status becomes
     * {@code resolved}. Package-private because only {@link IncidentService} may call it, and the service
     * refuses a second call rather than letting it overwrite the first resolver.
     */
    void resolve(String resolvedBy, Instant resolvedAt) {
        this.status = "resolved";
        this.resolvedBy = resolvedBy;
        this.resolvedAt = resolvedAt;
    }
}
