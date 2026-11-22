package dev.nexus.api.deploys;

import static dev.nexus.api.incidents.IncidentService.appliedOffset;
import static dev.nexus.api.incidents.IncidentService.effectiveLimit;

import dev.nexus.api.patches.PatchService;
import dev.nexus.api.reviews.PatchPullRequest;
import dev.nexus.api.reviews.PullRequestService;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v870 — the chain's fifth and last word: a deployment record.
 *
 * <p>The service RECORDS deployments; it does not perform them. It owns no cluster and no target, and the
 * one thing it must never do is claim a deployment happened. Hence two acts: a caller may REQUEST a
 * deployment of an APPROVED review request, and later a deployer may REPORT what they observed
 * ({@code succeeded} / {@code failed}) with their own name and account. The report is a claim by the
 * reporter, and {@code reportedBy} says whose.
 *
 * <p>Rules, refused by name:
 *
 * <ul>
 *   <li>The request must exist — 404 {@code unknown-pull-request}, checked BEFORE the fields.
 *   <li>The environment is exactly one of {@value #STAGING} / {@value #PRODUCTION}. No case folding.
 *   <li>The optional requester and reporter are trimmed, blank → null, bounded by their columns.
 *   <li>Only an APPROVED request may be deployed — 409 {@code not-approved}. An open request has no verdict
 *       yet; a rejected one has a verdict that says no. The approval check comes AFTER the fields, because a
 *       malformed body is malformed regardless of state.
 *   <li>A deployment may be completed ONCE — 409 {@code already-completed}. The gate is the conditional
 *       UPDATE's moved-row count, not a read-then-write: two concurrent reports cannot both complete it.
 * </ul>
 *
 * <p>On a successful report the patch's cursor moves to {@code deployed} in the SAME transaction; a failed
 * report leaves it approved, because the approval is still true and a retry is a new deployment record. A
 * reported completion never returns to requested — history is not overwritten.
 *
 * <p>No audit entry and no webhook delivery: the deployment table is the record. The listing uses the same
 * window rule as the four tables before it, CALLED rather than copied.
 */
@Service
public class DeploymentService {

    /** The two environments this slice accepts — a closed vocabulary, matched exactly. */
    public static final String STAGING = "staging";

    /** The environment whose name promises the most, and so is worth spelling once. */
    public static final String PRODUCTION = "production";

    /** The closed environment vocabulary, in the order the refusal prints it. */
    public static final List<String> ENVIRONMENTS = List.of(STAGING, PRODUCTION);

    /** The status every record starts at — a request, not an outcome. */
    public static final String REQUESTED = "requested";

    /** A reported success: the only word that moves the patch's cursor. */
    public static final String SUCCEEDED = "succeeded";

    /** A reported failure: the approval stands, the retry is a new record. */
    public static final String FAILED = "failed";

    /** The two words a completion report may carry. */
    public static final List<String> COMPLETIONS = List.of(SUCCEEDED, FAILED);

    /** The outcome column's width. */
    public static final int MAX_OUTCOME = 2000;

    /** The width of the requester / reporter columns. */
    public static final int MAX_ACTOR = 120;

    private final DeploymentRepository repository;
    private final PullRequestService requests;
    private final PatchService patches;
    private final Clock clock;

    public DeploymentService(
            DeploymentRepository repository,
            PullRequestService requests,
            PatchService patches,
            Clock clock) {
        this.repository = repository;
        this.requests = requests;
        this.patches = patches;
        this.clock = clock;
    }

    /**
     * Request a deployment of one approved review request.
     *
     * @return the stored record, so the 201 answers with exactly what was written
     */
    @Transactional
    public Deployment request(String pullRequestId, String environment, String requestedBy) {
        PatchPullRequest request = requests.read(pullRequestId);
        String cleanEnvironment = requireEnvironment(environment);
        String cleanRequester = optionalBounded(requestedBy, MAX_ACTOR, "requestedBy");
        if (!PullRequestService.APPROVED.equals(request.getStatus())) {
            throw new NotApproved("pull request \"" + request.getPullRequestId() + "\" is " + request.getStatus()
                    + " — only an approved request may be deployed");
        }
        Deployment row = new Deployment(
                UUID.randomUUID().toString(),
                request.getPullRequestId(),
                request.getPatchId(),
                cleanEnvironment,
                REQUESTED,
                cleanRequester,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return repository.save(row);
    }

    /**
     * Report what the deployer observed. The record must still be {@code requested}; the gate is the
     * conditional UPDATE, and 0 moved rows is 409 {@code already-completed}.
     */
    @Transactional
    public Deployment complete(String deploymentId, String status, String outcome, String reportedBy) {
        String id = requireId(deploymentId);
        Deployment row = read(id);
        String cleanStatus = requireCompletion(status);
        String cleanOutcome = optionalBounded(outcome, MAX_OUTCOME, "outcome");
        String cleanReporter = optionalBounded(reportedBy, MAX_ACTOR, "reportedBy");
        int moved = repository.completeIfRequested(
                id,
                cleanStatus,
                clock.instant().truncatedTo(ChronoUnit.MICROS),
                cleanReporter,
                cleanOutcome);
        if (moved == 0) {
            throw new AlreadyCompleted("deployment \"" + id + "\" is no longer requested — a completion was already reported");
        }
        if (SUCCEEDED.equals(cleanStatus)) {
            patches.deploy(row.getPatchId());
        }
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchDeployment("deployment \"" + id + "\" does not exist"));
    }

    /**
     * The request's deployments, newest first.
     *
     * <p>The request is read first so an unknown id is 404 {@code unknown-pull-request} rather than an
     * empty window: "nothing was deployed" and "there is no such request" are different answers.
     */
    @Transactional(readOnly = true)
    public List<Deployment> list(String pullRequestId, int limit, int offset) {
        requests.read(pullRequestId);
        int effective = effectiveLimit(limit);
        PageRequest window = PageRequest.of(appliedOffset(offset, effective) / effective, effective);
        return repository.findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(pullRequestId, window);
    }

    /** How many deployments that request holds in total — the number the window cannot answer. */
    @Transactional(readOnly = true)
    public long count(String pullRequestId) {
        requests.read(pullRequestId);
        return repository.countByPullRequestId(pullRequestId);
    }

    /** One record by id. An id that names nothing is {@link NoSuchDeployment}. */
    @Transactional(readOnly = true)
    public Deployment read(String deploymentId) {
        String id = requireId(deploymentId);
        return repository.findById(id)
                .orElseThrow(() -> new NoSuchDeployment("deployment \"" + id + "\" does not exist"));
    }

    private static String requireEnvironment(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDeployment("a deployment needs an environment — one of " + String.join(" / ", ENVIRONMENTS));
        }
        if (!ENVIRONMENTS.contains(raw)) {
            throw new InvalidDeployment("the environment \"" + raw + "\" is not one of "
                    + String.join(" / ", ENVIRONMENTS) + " — the vocabulary is closed and is matched exactly");
        }
        return raw;
    }

    private static String requireCompletion(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDeployment("a completion needs a status — one of " + String.join(" / ", COMPLETIONS));
        }
        if (!COMPLETIONS.contains(raw)) {
            throw new InvalidDeployment("the completion status \"" + raw + "\" is not one of "
                    + String.join(" / ", COMPLETIONS) + " — the vocabulary is closed and is matched exactly");
        }
        return raw;
    }

    /** An optional word: trimmed, blank becomes null, and its column width is refused rather than cut. */
    static String optionalBounded(String raw, int max, String field) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > max) {
            throw new InvalidDeployment("the deployment " + field + " is at most " + max
                    + " characters — this one is " + trimmed.length());
        }
        return trimmed;
    }

    /** An id is a value, not a spelling: no trimming, no case folding. */
    static String requireId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDeployment("a deployment id is required");
        }
        return raw;
    }
}
