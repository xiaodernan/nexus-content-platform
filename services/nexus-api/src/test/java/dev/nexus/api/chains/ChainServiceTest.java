package dev.nexus.api.chains;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.chains.ChainDtos.ChainPatch;
import dev.nexus.api.chains.ChainDtos.ChainRequest;
import dev.nexus.api.chains.ChainDtos.ChainView;
import dev.nexus.api.deploys.Deployment;
import dev.nexus.api.deploys.DeploymentService;
import dev.nexus.api.incidents.Incident;
import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.incidents.NoSuchIncident;
import dev.nexus.api.patches.IncidentPatch;
import dev.nexus.api.patches.PatchService;
import dev.nexus.api.reviews.DecisionService;
import dev.nexus.api.reviews.PatchPullRequest;
import dev.nexus.api.reviews.PullRequestDecision;
import dev.nexus.api.reviews.PullRequestService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * M9 v871 — the chain view's walk, asserted through the services that own each table.
 *
 * <p>The load-bearing cases: the walk goes through the OWNING services (so it cannot see a row a door would
 * refuse), it stops at an unknown incident before touching any child, and every level carries its total so a
 * truncated chain is distinguishable from a complete one.
 */
@ExtendWith(MockitoExtension.class)
class ChainServiceTest {

    private static final Instant AT = Instant.parse("2026-11-22T16:00:00Z");

    @Mock
    private IncidentService incidents;

    @Mock
    private PatchService patches;

    @Mock
    private PullRequestService requests;

    @Mock
    private DecisionService decisions;

    @Mock
    private DeploymentService deployments;

    private ChainService service;

    @BeforeEach
    void setUp() {
        service = new ChainService(incidents, patches, requests, decisions, deployments);
    }

    private static Incident incident() {
        return new Incident("i-1", "the credits ledger drifted", "read-time drift", "high",
                null, null, IncidentService.OPEN, "ada", AT);
    }

    private static IncidentPatch patch(String id) {
        return new IncidentPatch(id, "i-1", "clamp the drift", null, "+clamp\n", "ada",
                PatchService.APPROVED, AT);
    }

    private static PatchPullRequest request(String id) {
        return new PatchPullRequest(id, "p-1", "review the clamp", null,
                PullRequestService.APPROVED, "grace", AT);
    }

    private static PullRequestDecision decision(String id) {
        return new PullRequestDecision(id, "r-1", DecisionService.APPROVED, "smallest fix", "ada", AT);
    }

    private static Deployment deployment(String id) {
        return new Deployment(id, "r-1", "p-1", DeploymentService.STAGING,
                DeploymentService.SUCCEEDED, "ada", AT);
    }

    private void allowOneFullChain() {
        when(incidents.read("i-1")).thenReturn(incident());
        when(patches.list("i-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(patch("p-1")));
        when(patches.count("i-1")).thenReturn(1L);
        when(requests.list("p-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(request("r-1")));
        when(requests.count("p-1")).thenReturn(1L);
        when(decisions.list("r-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(decision("d-1")));
        when(decisions.count("r-1")).thenReturn(1L);
        when(deployments.list("r-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(deployment("dep-1")));
        when(deployments.count("r-1")).thenReturn(1L);
    }

    @Test
    void theWholeChainIsWalkedThroughTheServicesThatOwnEachTable() {
        allowOneFullChain();

        ChainView view = service.read("i-1");

        assertThat(view.incident().id()).isEqualTo("i-1");
        assertThat(view.incident().openedAt()).isEqualTo(AT.toEpochMilli());
        assertThat(view.patchTotal()).isEqualTo(1L);
        assertThat(view.patches()).hasSize(1);

        ChainPatch chainPatch = view.patches().get(0);
        assertThat(chainPatch.patch().id()).isEqualTo("p-1");
        assertThat(chainPatch.patch().diff()).isEqualTo("+clamp\n");
        assertThat(chainPatch.requestTotal()).isEqualTo(1L);

        ChainRequest chainRequest = chainPatch.pullRequests().get(0);
        assertThat(chainRequest.request().status()).isEqualTo(PullRequestService.APPROVED);
        assertThat(chainRequest.decisionTotal()).isEqualTo(1L);
        assertThat(chainRequest.decisions().get(0).verdict()).isEqualTo(DecisionService.APPROVED);
        assertThat(chainRequest.deploymentTotal()).isEqualTo(1L);
        assertThat(chainRequest.deployments().get(0).status()).isEqualTo(DeploymentService.SUCCEEDED);
    }

    @Test
    void anUnknownIncidentIsTheIncidentDoorsOwnRefusalAndNoChildIsRead() {
        when(incidents.read("nope")).thenThrow(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchIncident.class)
                .hasMessageContaining("nope");
        verifyNoInteractions(patches, requests, decisions, deployments);
    }

    @Test
    void anIncidentWithNoPatchesIsAChainOfZeroWithItsTotal() {
        when(incidents.read("i-1")).thenReturn(incident());
        when(patches.list("i-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of());
        when(patches.count("i-1")).thenReturn(0L);

        ChainView view = service.read("i-1");

        assertThat(view.patches()).isEmpty();
        assertThat(view.patchTotal()).isZero();
        verifyNoInteractions(requests, decisions, deployments);
    }

    @Test
    void everyChildListAsksForTheSameCapAsTheListingDoors() {
        allowOneFullChain();

        service.read("i-1");

        verify(patches).list("i-1", ChainService.CHILD_LIMIT, 0);
        verify(requests).list("p-1", ChainService.CHILD_LIMIT, 0);
        verify(decisions).list("r-1", ChainService.CHILD_LIMIT, 0);
        verify(deployments).list("r-1", ChainService.CHILD_LIMIT, 0);
    }

    @Test
    void aTruncatedLevelStillCarriesItsTrueTotal() {
        when(incidents.read("i-1")).thenReturn(incident());
        when(patches.list("i-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(patch("p-1")));
        when(patches.count("i-1")).thenReturn(250L);
        when(requests.list("p-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of());
        when(requests.count("p-1")).thenReturn(0L);

        ChainView view = service.read("i-1");

        assertThat(view.patches()).hasSize(1);
        assertThat(view.patchTotal()).isEqualTo(250L);
    }

    @Test
    void twoRequestsOnOnePatchAreBothNested() {
        when(incidents.read("i-1")).thenReturn(incident());
        when(patches.list("i-1", ChainService.CHILD_LIMIT, 0)).thenReturn(List.of(patch("p-1")));
        when(patches.count("i-1")).thenReturn(1L);
        when(requests.list("p-1", ChainService.CHILD_LIMIT, 0))
                .thenReturn(List.of(request("r-2"), request("r-1")));
        when(requests.count("p-1")).thenReturn(2L);
        when(decisions.list(anyString(), anyInt(), anyInt())).thenReturn(List.of());
        when(decisions.count(anyString())).thenReturn(0L);
        when(deployments.list(anyString(), anyInt(), anyInt())).thenReturn(List.of());
        when(deployments.count(anyString())).thenReturn(0L);

        ChainPatch chainPatch = service.read("i-1").patches().get(0);

        assertThat(chainPatch.pullRequests()).hasSize(2);
        assertThat(chainPatch.pullRequests().get(0).request().id()).isEqualTo("r-2");
        assertThat(chainPatch.pullRequests().get(0).decisions()).isEmpty();
        assertThat(chainPatch.pullRequests().get(0).deployments()).isEmpty();
        assertThat(chainPatch.requestTotal()).isEqualTo(2L);
    }
}
