package dev.nexus.api.chains;

import dev.nexus.api.deploys.DeploymentDtos.DeploymentRecord;
import dev.nexus.api.incidents.IncidentDtos.IncidentRecord;
import dev.nexus.api.patches.PatchDtos.PatchRecord;
import dev.nexus.api.reviews.DecisionDtos.DecisionRecord;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestRecord;
import java.util.List;

/**
 * M9 v871 — the READ model that shows the whole chain at once.
 *
 * <p>Five doors write five tables (incident, patch, review request, verdict, deployment record). Until now a
 * reader who wanted the story had to walk it one hop at a time. This view walks it for them: one incident,
 * its patches, each patch's review requests, and each request's decisions and deployments — every nested
 * value is the SAME record type its own door answers with, so a field added to a door shows up here and a
 * field renamed cannot silently diverge.
 *
 * <p>Read-only, and it says so by never writing anything: no new table, no cache, no summary row. Each child
 * list is capped at the same {@value ChainService#CHILD_LIMIT} the listing doors cap at, and every level
 * carries its total beside the window, so {@code total > list.size()} is the reader's honest signal that
 * something was left out.
 */
public final class ChainDtos {

    private ChainDtos() {
    }

    /** One incident and everything below it. {@code patchTotal} is the number the window could not carry. */
    public record ChainView(
            IncidentRecord incident,
            List<ChainPatch> patches,
            long patchTotal) {
    }

    /** One patch and its review requests. {@code requestTotal} is the patch's whole set. */
    public record ChainPatch(
            PatchRecord patch,
            List<ChainRequest> pullRequests,
            long requestTotal) {
    }

    /** One review request and the two kinds of record that follow it. */
    public record ChainRequest(
            PullRequestRecord request,
            List<DecisionRecord> decisions,
            long decisionTotal,
            List<DeploymentRecord> deployments,
            long deploymentTotal) {
    }
}
