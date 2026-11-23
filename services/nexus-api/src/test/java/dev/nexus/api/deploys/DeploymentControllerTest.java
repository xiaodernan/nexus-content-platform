package dev.nexus.api.deploys;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.deploys.DeploymentDtos.CompleteDeployment;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentList;
import dev.nexus.api.deploys.DeploymentDtos.DeploymentRecord;
import dev.nexus.api.deploys.DeploymentDtos.RequestDeployment;
import dev.nexus.api.reviews.NoSuchPullRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v870 — the deployment doors' HTTP envelope, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #aRequestedRecordCarriesNullsForWhatHasNotHappened()}: three fields are
 * null until a deployer reports, and nothing invents a finished time or a reporter.
 */
@ExtendWith(MockitoExtension.class)
class DeploymentControllerTest {

    private static final Instant AT = Instant.parse("2026-11-22T14:00:00Z");

    private static final String[] RECORD_FIELDS = {
            "environment", "finishedAt", "id", "outcome", "patchId", "pullRequestId",
            "reportedBy", "requestedAt", "requestedBy", "status"
    };

    private static final String[] LIST_FIELDS = {"count", "deployments", "limit", "offset", "total"};

    @Mock
    private DeploymentService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private DeploymentController controller() {
        return new DeploymentController(service);
    }

    private static Deployment requested(String id) {
        return new Deployment(id, "r-1", "p-1", DeploymentService.STAGING,
                DeploymentService.REQUESTED, "ada", AT);
    }

    // ── doors ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void requestingAnswersTwoHundredAndOneWithTheTenFields() {
        when(service.request("r-1", "staging", "ada")).thenReturn(requested("d-1"));

        ResponseEntity<DeploymentRecord> answer = controller()
                .request("r-1", new RequestDeployment("staging", "ada"));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        DeploymentRecord body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("d-1");
        assertThat(body.pullRequestId()).isEqualTo("r-1");
        assertThat(body.patchId()).isEqualTo("p-1");
        assertThat(body.environment()).isEqualTo(DeploymentService.STAGING);
        assertThat(body.status()).isEqualTo(DeploymentService.REQUESTED);
        assertThat(body.requestedAt()).isEqualTo(AT.toEpochMilli());

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(RECORD_FIELDS.length);
        for (String field : RECORD_FIELDS) {
            assertThat(wire.has(field)).as("a deployment must carry %s", field).isTrue();
        }
    }

    @Test
    void aRequestedRecordCarriesNullsForWhatHasNotHappened() {
        JsonNode wire = mapper.valueToTree(new DeploymentRecord(
                "d-1", "r-1", "p-1", DeploymentService.STAGING, DeploymentService.REQUESTED,
                "ada", AT.toEpochMilli(), null, null, null));

        assertThat(wire.get("finishedAt").isNull()).as("no finish time is invented").isTrue();
        assertThat(wire.get("reportedBy").isNull()).as("no reporter is invented").isTrue();
        assertThat(wire.get("outcome").isNull()).as("no outcome is invented").isTrue();
    }

    @Test
    void theListingCarriesTheWindowTheTwoCountsAndTheValuesItApplied() {
        when(service.list("r-1", 20, 0)).thenReturn(List.of(requested("d-1")));
        when(service.count("r-1")).thenReturn(1L);

        ResponseEntity<DeploymentList> answer = controller().list("r-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        DeploymentList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(1);
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(LIST_FIELDS.length);
        for (String field : LIST_FIELDS) {
            assertThat(wire.has(field)).as("a deployment listing must carry %s", field).isTrue();
        }
    }

    @Test
    void theListingReportsTheCapAndTheFloorItAppliedRatherThanWhatWasTyped() {
        when(service.list("r-1", 1000, 150)).thenReturn(List.of());
        when(service.count("r-1")).thenReturn(0L);

        DeploymentList body = controller().list("r-1", 1000, 150).getBody();

        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(100);
    }

    @Test
    void readingOneAnswersTwoHundred() {
        when(service.read("d-1")).thenReturn(requested("d-1"));

        ResponseEntity<DeploymentRecord> answer = controller().read("d-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().status()).isEqualTo(DeploymentService.REQUESTED);
    }

    @Test
    void completingAnswersTwoHundredWithTheCompletedRecord() {
        Deployment completed = new Deployment("d-1", "r-1", "p-1", DeploymentService.PRODUCTION,
                DeploymentService.SUCCEEDED, "ada", AT);
        when(service.complete("d-1", "succeeded", "it is live", "grace")).thenReturn(completed);

        ResponseEntity<DeploymentRecord> answer = controller()
                .complete("d-1", new CompleteDeployment("succeeded", "it is live", "grace"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().status()).isEqualTo(DeploymentService.SUCCEEDED);
    }

    // ── the five tokens ───────────────────────────────────────────────────────────────────────────

    @Test
    void aBrokenDeploymentIsAFourHundredThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller()
                .invalid(new InvalidDeployment("the environment \"Production\" is not one of staging / production"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-deployment");
    }

    @Test
    void anIdThatNamesNothingIsAFourHundredAndFourUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchDeployment("deployment \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-deployment");
    }

    @Test
    void aDeploymentOfARequestThatDoesNotExistIsTheParentDoorsFourHundredAndFour() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absentParent(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pull-request");
    }

    @Test
    void aRequestWithoutAYesIsAFourHundredAndNineThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller()
                .notApproved(new NotApproved("pull request \"r-1\" is open — only an approved request may be deployed"));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "not-approved");
    }

    @Test
    void aSecondReportIsAFourHundredAndNineThatNamesTheConflict() {
        ResponseEntity<Map<String, String>> answer = controller()
                .alreadyCompleted(new AlreadyCompleted("deployment \"d-1\" is no longer requested — a completion was already reported"));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "already-completed");
    }
}
