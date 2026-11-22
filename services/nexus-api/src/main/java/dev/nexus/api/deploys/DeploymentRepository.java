package dev.nexus.api.deploys;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * M9 v870 — the deployment table's doors, scoped to the request a deployment was cut from.
 *
 * <p>Order is {@code requestedAt DESC, deploymentId DESC}, the same newest-first rule as every other
 * listing. Completion is one conditional UPDATE: {@code status = 'requested'} lives inside it, so two
 * concurrent reports cannot both complete the same record. The entity is cleared afterwards so the
 * service's re-read answers what the database now holds rather than a stale persistence-context copy.
 */
public interface DeploymentRepository extends JpaRepository<Deployment, String> {

    /** The request's deployments, newest first — the window, not the whole set. */
    List<Deployment> findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(
            String pullRequestId, Pageable page);

    /** How many deployments that request holds in total. */
    long countByPullRequestId(String pullRequestId);

    /**
     * Complete one REQUESTED deployment with the reported outcome. Returns 1 for the caller who completed
     * it and 0 for everyone else — the answer a check-then-write gate cannot give.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Deployment d set d.status = :status, d.finishedAt = :finishedAt, "
            + "d.reportedBy = :reportedBy, d.outcome = :outcome "
            + "where d.deploymentId = :id and d.status = 'requested'")
    int completeIfRequested(
            @Param("id") String id,
            @Param("status") String status,
            @Param("finishedAt") Instant finishedAt,
            @Param("reportedBy") String reportedBy,
            @Param("outcome") String outcome);
}
