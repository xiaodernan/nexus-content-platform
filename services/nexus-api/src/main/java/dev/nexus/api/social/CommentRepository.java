package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M7 v285 — the repository for COMMENTS.
 *
 * <p>Every windowed finder carries a {@link Pageable}, so the cap reaches the DATABASE: a comment list
 * read whole and trimmed in memory would be a table scan on the fastest-growing table in this service.
 *
 * <p>There is no "count of every comment" and no finder that joins the publication: a comment is a fact
 * ABOUT a publication, and a repository that could report a global total would invite a feature (a
 * leaderboard, a most-commented list) that has no rules yet.
 */
public interface CommentRepository extends JpaRepository<CommentEntry, String> {

    /** The comments of one publication, newest first, capped by the caller's `Pageable`. */
    List<CommentEntry> findByTargetProjectIdOrderByCreatedAtDesc(String targetProjectId, Pageable pageable);

    /** ONE comment by its own id — the row a delete or a read names. */
    Optional<CommentEntry> findByCommentId(String commentId);

    /** The comments one account wrote, newest first, capped by the caller's `Pageable`. */
    List<CommentEntry> findByAuthorAccountIdOrderByCreatedAtDesc(String authorAccountId, Pageable pageable);

    /** How many comments a publication has, DELETED ONES INCLUDED. A removed comment is still a comment
     *  that happened; the count that matters to a reader is the count of what is VISIBLE, and that is
     *  computed by the caller over the rows it read. */
    long countByTargetProjectId(String targetProjectId);
}
