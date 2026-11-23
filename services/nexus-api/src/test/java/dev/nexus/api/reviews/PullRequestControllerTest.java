package dev.nexus.api.reviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.patches.NoSuchPatch;
import dev.nexus.api.reviews.PullRequestDtos.OpenPullRequest;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestList;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestRecord;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v868 — the review-request doors' HTTP envelope, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #theRecordCarriesNoDiffBecauseThePatchRowIsTheBytesOnlyHome()}: the
 * request names the patch and stops there, so a reader can never see two copies of a diff that disagree.
 */
@ExtendWith(MockitoExtension.class)
class PullRequestControllerTest {

    private static final Instant AT = Instant.parse("2026-11-22T10:00:00Z");

    private static final String[] RECORD_FIELDS = {
            "id", "openedAt", "openedBy", "patchId", "status", "summary", "title"
    };

    private static final String[] LIST_FIELDS = {"count", "limit", "offset", "pullRequests", "total"};

    @Mock
    private PullRequestService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private PullRequestController controller() {
        return new PullRequestController(service);
    }

    private static PatchPullRequest request(String id) {
        return new PatchPullRequest(id, "p-1", "review the lane fix", "it is red",
                PullRequestService.OPEN, "grace", AT);
    }

    // ── doors ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void openingAnswersTwoHundredAndOneWithTheSevenFields() throws Exception {
        when(service.open("p-1", "review the lane fix", "it is red", "grace")).thenReturn(request("r-1"));

        ResponseEntity<PullRequestRecord> answer = controller().open(
                "p-1", new OpenPullRequest("review the lane fix", "it is red", "grace"));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        PullRequestRecord body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("r-1");
        assertThat(body.patchId()).isEqualTo("p-1");
        assertThat(body.status()).isEqualTo(PullRequestService.OPEN);
        assertThat(body.openedAt()).isEqualTo(AT.toEpochMilli());

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(RECORD_FIELDS.length);
        for (String field : RECORD_FIELDS) {
            assertThat(wire.has(field)).as("a review request must carry %s", field).isTrue();
        }
    }

    @Test
    void theRecordCarriesNoDiffBecauseThePatchRowIsTheBytesOnlyHome() {
        JsonNode wire = mapper.valueToTree(new PullRequestRecord(
                "r-1", "p-1", "review the lane fix", "it is red",
                PullRequestService.OPEN, "grace", AT.toEpochMilli()));

        assertThat(wire.has("diff")).as("a second copy of the bytes would be two answers to one question").isFalse();
        assertThat(wire.get("patchId").asText()).isEqualTo("p-1");
    }

    @Test
    void theListingCarriesTheWindowTheTwoCountsAndTheValuesItApplied() {
        when(service.list("p-1", 20, 0)).thenReturn(List.of(request("r-2"), request("r-1")));
        when(service.count("p-1")).thenReturn(2L);

        ResponseEntity<PullRequestList> answer = controller().list("p-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        PullRequestList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(2);
        assertThat(body.total()).isEqualTo(2L);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(LIST_FIELDS.length);
        for (String field : LIST_FIELDS) {
            assertThat(wire.has(field)).as("a review-request listing must carry %s", field).isTrue();
        }
    }

    @Test
    void theListingReportsTheCapAndTheFloorItAppliedRatherThanWhatWasTyped() {
        when(service.list("p-1", 1000, 150)).thenReturn(List.of());
        when(service.count("p-1")).thenReturn(0L);

        PullRequestList body = controller().list("p-1", 1000, 150).getBody();

        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(100);
    }

    @Test
    void readingOneAnswersTwoHundred() {
        when(service.read("r-1")).thenReturn(request("r-1"));

        ResponseEntity<PullRequestRecord> answer = controller().read("r-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().patchId()).isEqualTo("p-1");
        assertThat(answer.getBody().openedBy()).isEqualTo("grace");
    }

    // ── the four tokens ───────────────────────────────────────────────────────────────────────────

    @Test
    void aBrokenRequestIsAFourHundredThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller()
                .invalid(new InvalidPullRequest("a review request needs a title — the one line that says what is being reviewed"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-pull-request");
        assertThat(answer.getBody().get("message")).contains("title");
    }

    @Test
    void anIdThatNamesNothingIsAFourHundredAndFourUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pull-request");
    }

    @Test
    void aRequestForAPatchThatDoesNotExistIsTheParentDoorsFourHundredAndFour() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absentParent(new NoSuchPatch("patch \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-patch");
    }

    @Test
    void aSecondOpenRequestIsAFourHundredAndNineThatNamesTheConflict() {
        ResponseEntity<Map<String, String>> answer = controller()
                .conflict(new AlreadyOpenPullRequest("patch \"p-1\" already has an open review request — read it instead of opening a second"));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "already-open");
        assertThat(answer.getBody().get("message")).contains("already has an open review request");
    }
}
