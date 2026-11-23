package dev.nexus.api.chains;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.chains.ChainDtos.ChainPatch;
import dev.nexus.api.chains.ChainDtos.ChainRequest;
import dev.nexus.api.chains.ChainDtos.ChainView;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentRecord;
import dev.nexus.api.incidents.IncidentDtos.IncidentRecord;
import dev.nexus.api.incidents.NoSuchIncident;
import dev.nexus.api.patches.PatchDtos.PatchRecord;
import dev.nexus.api.reviews.DecisionDtos.DecisionRecord;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestRecord;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v871 — the chain door's envelope, graded directly.
 *
 * <p>The load-bearing assertions: the view nests the SAME record shapes the five writing doors answer with
 * (eleven / eight / seven / six / ten fields), and every level carries its total beside its window.
 */
@ExtendWith(MockitoExtension.class)
class ChainControllerTest {

    private static final String[] VIEW_FIELDS = {"incident", "patchTotal", "patches"};
    private static final String[] PATCH_FIELDS = {"patch", "pullRequests", "requestTotal"};
    private static final String[] REQUEST_FIELDS = {
            "decisionTotal", "decisions", "deploymentTotal", "deployments", "request"
    };

    @Mock
    private ChainService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private ChainController controller() {
        return new ChainController(service);
    }

    private static IncidentRecord incident() {
        return new IncidentRecord("i-1", "the credits ledger drifted", null, "high", null, null,
                "open", "ada", 1_700_000_000_000L, null, null);
    }

    private static PatchRecord patch() {
        return new PatchRecord("p-1", "i-1", "clamp the drift", null, "+clamp\n", "ada",
                "approved", 1_700_000_000_000L);
    }

    private static PullRequestRecord request() {
        return new PullRequestRecord("r-1", "p-1", "review the clamp", null, "approved", "grace",
                1_700_000_000_000L);
    }

    private static DecisionRecord decision() {
        return new DecisionRecord("d-1", "r-1", "approved", "smallest fix", "ada", 1_700_000_000_000L);
    }

    private static DeploymentRecord deployment() {
        return new DeploymentRecord("dep-1", "r-1", "p-1", "staging", "succeeded", "ada",
                1_700_000_000_000L, 1_700_000_001_000L, "grace", "the probe is green");
    }

    private static ChainView view(long patchTotal) {
        return new ChainView(incident(), List.of(new ChainPatch(patch(),
                List.of(new ChainRequest(request(), List.of(decision()), 1L,
                        List.of(deployment()), 1L)), 1L)), patchTotal);
    }

    @Test
    void readingAnswersTwoHundredWithTheWholeNesting() {
        when(service.read("i-1")).thenReturn(view(1L));

        ResponseEntity<ChainView> answer = controller().read("i-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ChainView body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.incident().id()).isEqualTo("i-1");
        assertThat(body.patches()).hasSize(1);
        assertThat(body.patches().get(0).pullRequests()).hasSize(1);
    }

    @Test
    void everyLevelCarriesTheSameShapeItsOwnDoorAnswersWith() {
        JsonNode wire = mapper.valueToTree(view(1L));

        assertThat(wire.size()).isEqualTo(VIEW_FIELDS.length);
        for (String field : VIEW_FIELDS) {
            assertThat(wire.has(field)).as("the chain must carry %s", field).isTrue();
        }
        JsonNode chainPatch = wire.get("patches").get(0);
        assertThat(chainPatch.size()).isEqualTo(PATCH_FIELDS.length);
        JsonNode chainRequest = chainPatch.get("pullRequests").get(0);
        assertThat(chainRequest.size()).isEqualTo(REQUEST_FIELDS.length);
        assertThat(chainPatch.get("patch").size()).isEqualTo(8);
        assertThat(chainRequest.get("request").size()).isEqualTo(7);
        assertThat(chainRequest.get("decisions").get(0).size()).isEqualTo(6);
        assertThat(chainRequest.get("deployments").get(0).size()).isEqualTo(10);
        assertThat(wire.get("incident").size()).isEqualTo(11);
    }

    @Test
    void aTruncatedLevelStillCarriesItsTrueTotal() {
        when(service.read("i-1")).thenReturn(view(250L));

        JsonNode wire = mapper.valueToTree(controller().read("i-1").getBody());

        assertThat(wire.get("patches").size()).isEqualTo(1);
        assertThat(wire.get("patchTotal").asLong()).isEqualTo(250L);
    }

    @Test
    void anUnknownIncidentIsAFourHundredAndFourUnderTheIncidentToken() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-incident");
    }
}
