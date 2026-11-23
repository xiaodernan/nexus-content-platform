package dev.nexus.api.chains;

import dev.nexus.api.chains.ChainDtos.ChainPatch;
import dev.nexus.api.chains.ChainDtos.ChainRequest;
import dev.nexus.api.chains.ChainDtos.ChainView;
import dev.nexus.api.deploys.Deployment;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentRecord;
import dev.nexus.api.deploys.DeploymentService;
import dev.nexus.api.incidents.Incident;
import dev.nexus.api.incidents.IncidentDtos.IncidentRecord;
import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.patches.IncidentPatch;
import dev.nexus.api.patches.PatchDtos.PatchRecord;
import dev.nexus.api.patches.PatchService;
import dev.nexus.api.reviews.DecisionDtos.DecisionRecord;
import dev.nexus.api.reviews.DecisionService;
import dev.nexus.api.reviews.PatchPullRequest;
import dev.nexus.api.reviews.PullRequestDecision;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestRecord;
import dev.nexus.api.reviews.PullRequestService;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * M9 v871 — the read-only walk of the five-word chain.
 *
 * <p>Each level is read through the service that OWNS that table, so this view cannot see a row its own door
 * would refuse, and cannot grow a second opinion about ordering or windows. The walk is bounded: every child
 * list asks for {@value #CHILD_LIMIT} rows and reports its total beside them, so a reader can tell a complete
 * chain from a truncated one.
 *
 * <p>Nothing is written: no cache row, no summary, no audit entry. The five tables stay the only records,
 * and this class is a lens, not a sixth record.
 *
 * <p>The nested records are the exact types the writing doors answer with — {@link IncidentRecord},
 * {@link PatchRecord}, {@link PullRequestRecord}, {@link DecisionRecord}, {@link DeploymentRecord} — so the
 * view cannot invent a field or drop one silently; a change to a door's record changes this view too, at
 * compile time.
 */
@Service
public class ChainService {

    /** The most children one level will carry — the cap the listing doors already enforce. */
    public static final int CHILD_LIMIT = 100;

    private final IncidentService incidents;
    private final PatchService patches;
    private final PullRequestService requests;
    private final DecisionService decisions;
    private final DeploymentService deployments;

    public ChainService(
            IncidentService incidents,
            PatchService patches,
            PullRequestService requests,
            DecisionService decisions,
            DeploymentService deployments) {
        this.incidents = incidents;
        this.patches = patches;
        this.requests = requests;
        this.decisions = decisions;
        this.deployments = deployments;
    }

    /**
     * One incident's whole chain, five words deep.
     *
     * <p>An id that names nothing is the incident door's own 404 ({@code unknown-incident}), raised by
     * {@link IncidentService#read} before any child is touched.
     */
    @Transactional(readOnly = true)
    public ChainView read(String incidentId) {
        Incident incident = incidents.read(incidentId);
        List<IncidentPatch> patchRows = patches.list(incidentId, CHILD_LIMIT, 0);
        long patchTotal = patches.count(incidentId);

        List<ChainPatch> chainPatches = new ArrayList<>(patchRows.size());
        for (IncidentPatch patch : patchRows) {
            List<PatchPullRequest> requestRows = requests.list(patch.getPatchId(), CHILD_LIMIT, 0);
            long requestTotal = requests.count(patch.getPatchId());

            List<ChainRequest> chainRequests = new ArrayList<>(requestRows.size());
            for (PatchPullRequest request : requestRows) {
                List<PullRequestDecision> decisionRows =
                        decisions.list(request.getPullRequestId(), CHILD_LIMIT, 0);
                long decisionTotal = decisions.count(request.getPullRequestId());
                List<Deployment> deploymentRows =
                        deployments.list(request.getPullRequestId(), CHILD_LIMIT, 0);
                long deploymentTotal = deployments.count(request.getPullRequestId());
                chainRequests.add(new ChainRequest(
                        pullRequestRecord(request),
                        decisionRows.stream().map(ChainService::decisionRecord).toList(),
                        decisionTotal,
                        deploymentRows.stream().map(ChainService::deploymentRecord).toList(),
                        deploymentTotal));
            }
            chainPatches.add(new ChainPatch(patchRecord(patch), chainRequests, requestTotal));
        }
        return new ChainView(incidentRecord(incident), chainPatches, patchTotal);
    }

    // ── the five mappings: the same fields their own doors answer with ───────────────────────────────

    private static IncidentRecord incidentRecord(Incident row) {
        return new IncidentRecord(
                row.getIncidentId(),
                row.getTitle(),
                row.getSummary(),
                row.getSeverity(),
                row.getTargetKind(),
                row.getTargetId(),
                row.getStatus(),
                row.getOpenedBy(),
                row.getOpenedAt().toEpochMilli(),
                row.getResolvedBy(),
                row.getResolvedAt() == null ? null : row.getResolvedAt().toEpochMilli());
    }

    private static PatchRecord patchRecord(IncidentPatch row) {
        return new PatchRecord(
                row.getPatchId(),
                row.getIncidentId(),
                row.getTitle(),
                row.getSummary(),
                row.getDiff(),
                row.getAuthor(),
                row.getStatus(),
                row.getCreatedAt().toEpochMilli());
    }

    private static PullRequestRecord pullRequestRecord(PatchPullRequest row) {
        return new PullRequestRecord(
                row.getPullRequestId(),
                row.getPatchId(),
                row.getTitle(),
                row.getSummary(),
                row.getStatus(),
                row.getOpenedBy(),
                row.getOpenedAt().toEpochMilli());
    }

    private static DecisionRecord decisionRecord(PullRequestDecision row) {
        return new DecisionRecord(
                row.getDecisionId(),
                row.getPullRequestId(),
                row.getVerdict(),
                row.getReason(),
                row.getDecidedBy(),
                row.getDecidedAt().toEpochMilli());
    }

    private static DeploymentRecord deploymentRecord(Deployment row) {
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
}
