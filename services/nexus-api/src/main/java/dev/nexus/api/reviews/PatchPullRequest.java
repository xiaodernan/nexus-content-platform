package dev.nexus.api.reviews;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M9 v868 — ONE pull request: a patch offered for review, attached to exactly one patch.
 *
 * <p>This is the third word of M9's chain (incident→patch→PR→approve→deploy). The record is the REQUEST,
 * not its outcome: it says "review this patch", who asked, and when. It carries no verdict, no approver, no
 * merge commit and no deployment — the chain's fourth and fifth words will write those, and until they
 * exist a reader can see that this request is still {@code open}.
 *
 * <p>Deliberately absent from this table: the diff. The patch row already holds the bytes, and copying them
 * here would create two answers to one question — the first read would be right, the second would drift.
 * A reader who wants the bytes follows {@code patchId}; that is one hop, not a second copy.
 *
 * <p>{@code status} is {@code open} and this slice writes no other value. There is no state machine here.
 * A patch may be submitted again after a future refusal closes its request; this slice only refuses to
 * have TWO open requests for one patch at once, because two open requests would make "which one is being
 * reviewed" a question with no answer.
 */
@Entity
@Table(name = "patch_pull_request")
public class PatchPullRequest {

    /** The request's own id — minted here, never chosen by the caller. */
    @Id
    @Column(name = "pull_request_id", nullable = false, length = 64)
    private String pullRequestId;

    /** The patch this request puts up for review. Stored as a value; the service checks it at the door. */
    @Column(name = "patch_id", nullable = false, length = 64)
    private String patchId;

    /** The request in one line, trimmed, 1..120 — what a listing shows. */
    @Column(name = "title", nullable = false, length = 120)
    private String title;

    /** Why this request now, when the author said. Null when they said nothing more. */
    @Column(name = "summary", length = 2000)
    private String summary;

    /** {@code open}; the chain's later words will move this, and this slice moves nothing. */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /** Who asked for the review, when the caller said. Host-declared and opaque like every account id here. */
    @Column(name = "opened_by", length = 120)
    private String openedBy;

    /** When the service recorded the request — its own instant, never the caller's. */
    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    protected PatchPullRequest() {
        // JPA needs it; the service never builds one without values.
    }

    public PatchPullRequest(
            String pullRequestId,
            String patchId,
            String title,
            String summary,
            String status,
            String openedBy,
            Instant openedAt) {
        this.pullRequestId = pullRequestId;
        this.patchId = patchId;
        this.title = title;
        this.summary = summary;
        this.status = status;
        this.openedBy = openedBy;
        this.openedAt = openedAt;
    }

    public String getPullRequestId() {
        return pullRequestId;
    }

    public String getPatchId() {
        return patchId;
    }

    public String getTitle() {
        return title;
    }

    public String getSummary() {
        return summary;
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
}
