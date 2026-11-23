package dev.nexus.api.deploys;

import java.util.List;

/**
 * M9 v870 — the wire shapes for deployments.
 *
 * <p>{@code finishedAt} is null while the record is {@code requested}, and an epoch-millisecond instant
 * afterwards. {@code outcome} and {@code reportedBy} are null until a completion is reported. Times are
 * epoch milliseconds at the wire, the client's own unit, like every other instant here.
 */
public final class DeploymentDtos {

    private DeploymentDtos() {
    }

    /** The body a caller sends to request a deployment of an approved request. */
    public record RequestDeployment(String environment, String requestedBy) {
    }

    /** The body a caller sends to report what the deployer observed. */
    public record CompleteDeployment(String status, String outcome, String reportedBy) {
    }

    /** One deployment as every answer carries it: ten fields, three of them null while requested. */
    public record DeploymentRecord(
            String id,
            String pullRequestId,
            String patchId,
            String environment,
            String status,
            String requestedBy,
            long requestedAt,
            Long finishedAt,
            String reportedBy,
            String outcome) {
    }

    /** The window a listing answers with, and the two counts beside it. */
    public record DeploymentList(
            List<DeploymentRecord> deployments,
            int count,
            long total,
            int limit,
            int offset) {
    }
}
