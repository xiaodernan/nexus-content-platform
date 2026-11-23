package dev.nexus.api.deploys;

import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.reviews.NoSuchPullRequest;
import dev.nexus.api.deploys.DeploymentDtos.CompleteDeployment;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentList;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentRecord;
import dev.nexus.api.deploys.DeploymentDtos.RequestDeployment;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 v870 — the HTTP surface for deployments. Four doors:
 *
 * <ul>
 *   <li>{@code POST /pull-requests/{pullRequestId}/deployments} — request one. 201 with the record; 404
 *       {@code unknown-pull-request}; 400 {@code invalid-deployment}; 409 {@code not-approved} when the
 *       request has no yes.
 *   <li>{@code GET /pull-requests/{pullRequestId}/deployments?limit=&offset=} — the newest window, scoped to
 *       one request, with both counts.
 *   <li>{@code GET /deployments/{deploymentId}} — one record; 404 {@code unknown-deployment}.
 *   <li>{@code POST /deployments/{deploymentId}/complete} — report the outcome. 200 with the completed
 *       record; 409 {@code already-completed} when it was already reported.
 * </ul>
 *
 * <p>There is no door that deploys. This service records what a deployer requested and what a deployer
 * reported; the report is a claim, and {@code reportedBy} says whose.
 */
@RestController
public class DeploymentController {

    private final DeploymentService service;

    public DeploymentController(DeploymentService service) {
        this.service = service;
    }

    /** Request a deployment of one approved review request. 201 when the row was made. */
    @PostMapping("/pull-requests/{pullRequestId}/deployments")
    public ResponseEntity<DeploymentRecord> request(
            @PathVariable String pullRequestId,
            @RequestBody RequestDeployment request) {
        Deployment row = service.request(
                pullRequestId,
                request == null ? null : request.environment(),
                request == null ? null : request.requestedBy());
        return ResponseEntity.status(201).body(record(row));
    }

    /**
     * The request's newest deployments, with both counts beside the window.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the request holds.
     */
    @GetMapping("/pull-requests/{pullRequestId}/deployments")
    public ResponseEntity<DeploymentList> list(
            @PathVariable String pullRequestId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? IncidentService.DEFAULT_LIST_LIMIT : limit;
        int from = offset == null ? 0 : offset;
        List<Deployment> rows = service.list(pullRequestId, asked, from);
        int effective = IncidentService.effectiveLimit(asked);
        List<DeploymentRecord> records = rows.stream().map(DeploymentController::record).toList();
        return ResponseEntity.ok(new DeploymentList(
                records,
                records.size(),
                service.count(pullRequestId),
                effective,
                IncidentService.appliedOffset(from, effective)));
    }

    /** One record. 404 when the id names nothing. */
    @GetMapping("/deployments/{deploymentId}")
    public ResponseEntity<DeploymentRecord> read(@PathVariable String deploymentId) {
        return ResponseEntity.ok(record(service.read(deploymentId)));
    }

    /** Report the outcome the deployer observed. 200 with the completed record. */
    @PostMapping("/deployments/{deploymentId}/complete")
    public ResponseEntity<DeploymentRecord> complete(
            @PathVariable String deploymentId,
            @RequestBody CompleteDeployment report) {
        Deployment row = service.complete(
                deploymentId,
                report == null ? null : report.status(),
                report == null ? null : report.outcome(),
                report == null ? null : report.reportedBy());
        return ResponseEntity.ok(record(row));
    }

    /** One row as every answer carries it. Instants are epoch milliseconds; null stays null. */
    private static DeploymentRecord record(Deployment row) {
        return new DeploymentRecord(
                row.getDeploymentId(),
                row.getPullRequestId(),
                row.getPatchId(),
                row.getEnvironment(),
                row.getStatus(),
                row.getRequestedBy(),
                row.getRequestedAt().toEpochMilli(),
                row.getFinishedAt() == null ? null : row.getFinishedAt().toEpochMilli(),
                row.getReportedBy(),
                row.getOutcome());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidDeployment.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidDeployment e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-deployment", "message", e.getMessage()));
    }

    /** An id that names no deployment is a 404 under its own name. */
    @ExceptionHandler(NoSuchDeployment.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchDeployment e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-deployment", "message", e.getMessage()));
    }

    /** The parent door's refusal: a deployment of a request that does not exist is 404 unknown-pull-request. */
    @ExceptionHandler(NoSuchPullRequest.class)
    public ResponseEntity<Map<String, String>> absentParent(NoSuchPullRequest e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-pull-request", "message", e.getMessage()));
    }

    /** A request that was not approved is a 409: there is no yes to deploy. */
    @ExceptionHandler(NotApproved.class)
    public ResponseEntity<Map<String, String>> notApproved(NotApproved e) {
        return ResponseEntity.status(409).body(Map.of("error", "not-approved", "message", e.getMessage()));
    }

    /** A record that was already completed is a 409: its history is not rewritten by a second report. */
    @ExceptionHandler(AlreadyCompleted.class)
    public ResponseEntity<Map<String, String>> alreadyCompleted(AlreadyCompleted e) {
        return ResponseEntity.status(409).body(Map.of("error", "already-completed", "message", e.getMessage()));
    }
}
