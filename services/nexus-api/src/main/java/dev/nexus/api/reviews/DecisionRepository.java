package dev.nexus.api.reviews;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M9 v869 — the decision table's doors, scoped to the request the verdict is about.
 *
 * <p>Order is {@code decidedAt DESC, decisionId DESC}, the same newest-first rule as every other listing
 * here. The count is narrowed by {@code pullRequestId} for the same reason the window is: a listing for one
 * request may not report the whole table's size.
 */
public interface DecisionRepository extends JpaRepository<PullRequestDecision, String> {

    /** The request's decisions, newest first — the window, not the whole set. */
    List<PullRequestDecision> findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(
            String pullRequestId, Pageable page);

    /** How many decisions that request holds in total. */
    long countByPullRequestId(String pullRequestId);
}
