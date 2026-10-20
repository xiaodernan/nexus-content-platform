package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M7 v285 — ONE comment: an account saying something ABOUT a publication.
 *
 * <p>A comment is a row and not a field on the publication, for the same reason a like is: a comment
 * APPENDS, and a publication row is REPLACED on every re-publish. A comment stored in the publication's
 * document would be erased by the next publish.
 *
 * <p>Unlike a like, a comment has a BODY, and the body is stored VERBATIM: this service is a record, not
 * an interpreter. The ESCAPING is the caller's job, and the client's own community model says so
 * explicitly ("the body, already HTML-escaped"). A service that escaped on the way in would store
 * something the reader would see twice-escaped; a service that escaped on the way out would be trusting
 * every future reader to remember.
 *
 * <p>A comment is SOFT-deleted: the row stays and carries {@code deleted = true}, because "this comment
 * was removed" and "this comment never existed" are different facts, and a hard delete would make the
 * first indistinguishable from the second. The client's own model has the same field.
 */
@Entity
@Table(name = "comment_entry")
public class CommentEntry {

    /** The comment's own id. A string, so the client can name it without learning about a sequence. */
    @Id
    @Column(name = "comment_id", nullable = false, length = 64)
    private String commentId;

    /** The publication the comment is about. */
    @Column(name = "target_project_id", nullable = false, length = 200)
    private String targetProjectId;

    /** The account that wrote it. The claim's account id — never blank, or the comment would have no author. */
    @Column(name = "author_account_id", nullable = false, length = 200)
    private String authorAccountId;

    /** The handle the claim carried, when it carried one. */
    @Column(name = "author_handle", length = 24)
    private String authorHandle;

    /** What the claim was worth when it arrived. `unsigned-local` in this build. */
    @Column(name = "author_assurance", length = 32)
    private String authorAssurance;

    /** The body, verbatim. The caller escaped it; the service did not. */
    @Column(name = "body", nullable = false, columnDefinition = "text")
    private String body;

    /** When the comment happened — the service's own instant, not the client's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Whether the author has taken it back. The row stays either way. */
    @Column(name = "deleted", nullable = false)
    private boolean deleted;

    protected CommentEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public CommentEntry(
            String commentId,
            String targetProjectId,
            String authorAccountId,
            String authorHandle,
            String authorAssurance,
            String body,
            Instant createdAt) {
        this.commentId = commentId;
        this.targetProjectId = targetProjectId;
        this.authorAccountId = authorAccountId;
        this.authorHandle = authorHandle;
        this.authorAssurance = authorAssurance;
        this.body = body;
        this.createdAt = createdAt;
        this.deleted = false;
    }

    public String getCommentId() {
        return commentId;
    }

    public String getTargetProjectId() {
        return targetProjectId;
    }

    public String getAuthorAccountId() {
        return authorAccountId;
    }

    public String getAuthorHandle() {
        return authorHandle;
    }

    public String getAuthorAssurance() {
        return authorAssurance;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isDeleted() {
        return deleted;
    }

    /** Mark the comment as taken back. The row stays: "removed" and "never existed" are different facts. */
    public void markDeleted() {
        this.deleted = true;
    }
}
