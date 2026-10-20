package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M7 v283 — the repository for LIKES.
 *
 * <p>Deliberately no "count of every like in the table" and no finder that joins the publication: a like
 * is a fact ABOUT a publication, and a repository that could report a global total would invite a
 * feature (a leaderboard) that has no rules yet.
 *
 * <p>Every finder that takes a window takes a {@link Pageable}, so the cap reaches the DATABASE. A like
 * list read whole and trimmed in memory would be a table scan on every page load — and the like table is
 * the fastest-growing table in this service.
 */
public interface LikeRepository extends JpaRepository<LikeEntry, Long> {

    /** THE like of one publication by one account — the row a second like would collide with. */
    Optional<LikeEntry> findByTargetProjectIdAndActorAccountId(String targetProjectId, String actorAccountId);

    /** How many accounts liked this publication. */
    long countByTargetProjectId(String targetProjectId);

    /** The likes of one publication, newest first, capped by the caller's `Pageable`. */
    List<LikeEntry> findByTargetProjectIdOrderByCreatedAtDesc(String targetProjectId, Pageable pageable);

    /** The likes one account gave, newest first, capped by the caller's `Pageable`. */
    List<LikeEntry> findByActorAccountIdOrderByCreatedAtDesc(String actorAccountId, Pageable pageable);
}
