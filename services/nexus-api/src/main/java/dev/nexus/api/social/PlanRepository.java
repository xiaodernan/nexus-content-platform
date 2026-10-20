package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M7 v300 — the repository for PLANS.
 *
 * <p>The plan table is small and the finders are windowed: a creator's catalogue is read when somebody
 * visits their profile, and it should not be a table scan.
 */
public interface PlanRepository extends JpaRepository<PlanEntry, String> {

    /** ONE plan by its id — the plan a subscription names. */
    Optional<PlanEntry> findByPlanId(String planId);

    /** The plans one creator offers, newest first, capped by the caller's `Pageable`. */
    List<PlanEntry> findByCreatorAccountIdOrderByCreatedAtDesc(String creatorAccountId, Pageable pageable);
}
