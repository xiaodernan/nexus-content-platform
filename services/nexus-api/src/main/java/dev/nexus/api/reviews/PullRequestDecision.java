package dev.nexus.api.reviews;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M9 v869 — ONE decision on one review request: the chain's fourth word.
 *
 * <p>A verdict is its own record, not a column edited into the request: who said yes or no, why, and when
 * are facts that must survive, and a reviewer who changes their mind later is a SECOND fact about a
 * different request — not an edit of the first. The request row's {@code status} carries the same word
 * ({@code approved} / {@code rejected}) because that is what a listing filters on; the two are written in
 * one transaction so they cannot disagree.
 *
 * <p>This record does not merge, apply, deploy or even check that the patch applies. It is a person's
 * judgment, written down. The chain's fifth word will read it; nothing here pretends to be it.
 */
@Entity
@Table(name = "pull_request_decision")
public class PullRequestDecision {

    /** The decision's own id — minted here, never chosen by the caller. */
    @Id
    @Column(name = "decision_id", nullable = false, length = 64)
    private String decisionId;

    /** The request this verdict is about. Stored as a value; the service checks it at the door. */
    @Column(name = "pull_request_id", nullable = false, length = 64)
    private String pullRequestId;

    /** {@code approved} or {@code rejected} — the same two words the request's status may become. */
    @Column(name = "verdict", nullable = false, length = 20)
    private String verdict;

    /** Why, when the reviewer said. Null when they said nothing more. */
    @Column(name = "reason", length = 2000)
    private String reason;

    /** Who decided, when the caller said. Host-declared and opaque like every account id here. */
    @Column(name = "decided_by", length = 120)
    private String decidedBy;

    /** When the service recorded the verdict — its own instant, never the caller's. */
    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt;

    protected PullRequestDecision() {
        // JPA needs it; the service never builds one without values.
    }

    public PullRequestDecision(
            String decisionId,
            String pullRequestId,
            String verdict,
            String reason,
            String decidedBy,
            Instant decidedAt) {
        this.decisionId = decisionId;
        this.pullRequestId = pullRequestId;
        this.verdict = verdict;
        this.reason = reason;
        this.decidedBy = decidedBy;
        this.decidedAt = decidedAt;
    }

    public String getDecisionId() {
        return decisionId;
    }

    public String getPullRequestId() {
        return pullRequestId;
    }

    public String getVerdict() {
        return verdict;
    }

    public String getReason() {
        return reason;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }
}
