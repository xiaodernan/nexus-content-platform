package dev.nexus.api.reviews;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * M9 v868 — the pull-request table's doors, scoped to the patch whose review it requests.
 *
 * <p>Both reads carry the same order: {@code openedAt DESC, pullRequestId DESC} — newest first, with the id
 * as the tie-break so two requests written in the same microsecond still have one stable order. The count
 * that opens the double-submit gate is narrowed by the same patch AND by the status word, because the
 * invariant is about OPEN requests, not about the history a patch may accumulate.
 */
public interface PullRequestRepository extends JpaRepository<PatchPullRequest, String> {

    /** The patch's review requests, newest first — the window, not the whole set. */
    List<PatchPullRequest> findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(String patchId, Pageable page);

    /** How many review requests that patch holds in total. */
    long countByPatchId(String patchId);

    /** How many requests for that patch carry one status — the double-submit gate's reading. */
    long countByPatchIdAndStatus(String patchId, String status);

    /**
     * Close one OPEN request, atomically: the {@code status = 'open'} predicate lives in the UPDATE, so two
     * concurrent decisions cannot both move the row. Returns 1 when this caller closed it, 0 when somebody
     * else already did — the answer a check-then-write gate cannot give.
     */
    @Modifying
    @Query("update PatchPullRequest r set r.status = :status where r.pullRequestId = :id and r.status = 'open'")
    int closeIfOpen(@Param("id") String id, @Param("status") String status);
}
