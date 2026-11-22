package dev.nexus.api.deploys;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M9 v870 — ONE deployment record: the chain's fifth and last word.
 *
 * <p>This service cannot deploy. It owns no cluster, no image registry and no target environment, and a
 * door that pretended to deploy would be the exact lie these records exist to prevent. What it CAN hold is
 * the record a deployer writes: this approved request, this environment, who asked, when the service
 * recorded the request — and, later, the outcome the deployer REPORTS (succeeded / failed), with its own
 * instant and reporter. The outcome is a report, not an observation; {@code reportedBy} is there so a reader
 * can see whose word it is.
 *
 * <p>{@code status} is {@code requested} until a completion is reported. A completed row never returns to
 * requested: a retry is a NEW deployment record, so the history of attempts is not overwritten.
 *
 * <p>{@code patchId} is stored beside {@code pullRequestId} although it is reachable in one hop: completion
 * must move the patch's cursor to {@code deployed} on success, and the completion door should not depend on
 * a join whose parent could be walked away from. Both values are immutable once written.
 */
@Entity
@Table(name = "deployment")
public class Deployment {

    /** The record's own id — minted here, never chosen by the caller. */
    @Id
    @Column(name = "deployment_id", nullable = false, length = 64)
    private String deploymentId;

    /** The approved review request this deployment was cut from. */
    @Column(name = "pull_request_id", nullable = false, length = 64)
    private String pullRequestId;

    /** The patch whose cursor moves to deployed on success. Immutable, like the request id. */
    @Column(name = "patch_id", nullable = false, length = 64)
    private String patchId;

    /** {@code staging} or {@code production} — the closed vocabulary this slice accepts. */
    @Column(name = "environment", nullable = false, length = 40)
    private String environment;

    /** {@code requested} until a completion is reported; then {@code succeeded} or {@code failed}. */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /** Who asked for the deployment, when the caller said. */
    @Column(name = "requested_by", length = 120)
    private String requestedBy;

    /** When the service recorded the request — its own instant, never the caller's. */
    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    /** When the outcome was reported. Null while requested. */
    @Column(name = "finished_at")
    private Instant finishedAt;

    /** Who reported the outcome. Null while requested — the report's author is not the requester. */
    @Column(name = "reported_by", length = 120)
    private String reportedBy;

    /** What the deployer said happened, when they said more than the status word. Null while requested. */
    @Column(name = "outcome", length = 2000)
    private String outcome;

    protected Deployment() {
        // JPA needs it; the service never builds one without values.
    }

    public Deployment(
            String deploymentId,
            String pullRequestId,
            String patchId,
            String environment,
            String status,
            String requestedBy,
            Instant requestedAt) {
        this.deploymentId = deploymentId;
        this.pullRequestId = pullRequestId;
        this.patchId = patchId;
        this.environment = environment;
        this.status = status;
        this.requestedBy = requestedBy;
        this.requestedAt = requestedAt;
    }

    public String getDeploymentId() {
        return deploymentId;
    }

    public String getPullRequestId() {
        return pullRequestId;
    }

    public String getPatchId() {
        return patchId;
    }

    public String getEnvironment() {
        return environment;
    }

    public String getStatus() {
        return status;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public String getReportedBy() {
        return reportedBy;
    }

    public String getOutcome() {
        return outcome;
    }
}
