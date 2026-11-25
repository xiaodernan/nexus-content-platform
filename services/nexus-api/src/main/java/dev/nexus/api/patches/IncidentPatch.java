package dev.nexus.api.patches;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M9 v595 — ONE patch: the bytes an author wrote as a proposed change, attached to exactly one incident.
 *
 * <p>This is the second word of M9's chain (incident→patch→PR→approve→deploy). A patch here is a RECORD,
 * not an action: the service stores the diff exactly as it arrived and never applies it, never parses it,
 * never checks that it is a valid diff, and never runs a patcher. The bytes are the author's claim that
 * this change is the fix; whether they apply is a fact about a repository this service does not own.
 *
 * <p>The diff is deliberately NOT trimmed. A diff's leading spaces are context lines and its trailing
 * newline is part of the format — trimming it would change bytes the author vouched for, and a record that
 * silently edits the thing it records is worse than one that refuses it. A diff that is only whitespace is
 * refused: zero bytes propose nothing.
 *
 * <p>{@code status} is {@code proposed} and this slice writes no other value. The later words (a PR, an
 * approval, a deployment) will move it; until they exist, a reader can still see that nothing has happened
 * to this proposal yet. There is no state machine here, and the service does not require the incident to
 * still be open: the fix for what happened can arrive after the record was closed.
 */
@Entity
@Table(name = "incident_patch")
public class IncidentPatch {

    /** The patch's own id — minted here, never chosen by the caller. */
    @Id
    @Column(name = "patch_id", nullable = false, length = 64)
    private String patchId;

    /** The incident this proposal is about. Stored as a value; the service checks it at the door. */
    @Column(name = "incident_id", nullable = false, length = 64)
    private String incidentId;

    /** The proposal in one line, trimmed, 1..120 — what a listing shows. */
    @Column(name = "title", nullable = false, length = 120)
    private String title;

    /** Why this change, when the author said. Null when they said nothing more. */
    @Column(name = "summary", length = 2000)
    private String summary;

    /** The bytes themselves, exactly as sent. Never trimmed, never parsed, never applied. */
    @Column(name = "patch_diff", nullable = false, length = 20000)
    private String diff;

    /** Who proposed it, when the caller said. Host-declared and opaque like every account id here. */
    @Column(name = "author", length = 120)
    private String author;

    /** {@code proposed}; the later words of the chain will move this, and this slice moves nothing. */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /** When the service recorded the proposal — its own instant, never the caller's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected IncidentPatch() {
        // JPA needs it; the service never builds one without values.
    }

    public IncidentPatch(
            String patchId,
            String incidentId,
            String title,
            String summary,
            String diff,
            String author,
            String status,
            Instant createdAt) {
        this.patchId = patchId;
        this.incidentId = incidentId;
        this.title = title;
        this.summary = summary;
        this.diff = diff;
        this.author = author;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getPatchId() {
        return patchId;
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

    public String getDiff() {
        return diff;
    }

    public String getAuthor() {
        return author;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
