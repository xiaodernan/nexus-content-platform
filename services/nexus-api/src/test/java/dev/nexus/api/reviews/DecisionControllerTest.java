package dev.nexus.api.reviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.reviews.DecisionDtos.Decide;
import dev.nexus.api.reviews.DecisionDtos.DecisionList;
import dev.nexus.api.reviews.DecisionDtos.DecisionRecord;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v869 — the decision doors' HTTP envelope, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #theRecordCarriesExactlySixFieldsAndNoBytes()}: a verdict names the
 * request and the word it chose, and nothing about the patch's bytes.
 */
@ExtendWith(MockitoExtension.class)
class DecisionControllerTest {

    private static final Instant AT = Instant.parse("2026-11-22T12:00:00Z");

    private static final String[] RECORD_FIELDS = {
            "decidedAt", "decidedBy", "id", "pullRequestId", "reason", "verdict"
    };

    private static final String[] LIST_FIELDS = {"count", "decisions", "limit", "offset", "total"};

    @Mock
    private DecisionService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private DecisionController controller() {
        return new DecisionController(service);
    }

    private static PullRequestDecision decision(String id) {
        return new PullRequestDecision(id, "r-1", DecisionService.APPROVED, "it is the smallest fix",
                "ada", AT);
    }

    // ── doors ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void decidingAnswersTwoHundredAndOneWithTheSixFields() {
        when(service.decide("r-1", "approved", "it is the smallest fix", "ada"))
                .thenReturn(decision("d-1"));

        ResponseEntity<DecisionRecord> answer = controller().decide(
                "r-1", new Decide("approved", "it is the smallest fix", "ada"));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        DecisionRecord body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("d-1");
        assertThat(body.pullRequestId()).isEqualTo("r-1");
        assertThat(body.verdict()).isEqualTo(DecisionService.APPROVED);
        assertThat(body.decidedAt()).isEqualTo(AT.toEpochMilli());

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(RECORD_FIELDS.length);
        for (String field : RECORD_FIELDS) {
            assertThat(wire.has(field)).as("a decision must carry %s", field).isTrue();
        }
    }

    @Test
    void theRecordCarriesExactlySixFieldsAndNoBytes() {
        JsonNode wire = mapper.valueToTree(new DecisionRecord(
                "d-1", "r-1", DecisionService.REJECTED, "drift is upstream", "grace", AT.toEpochMilli()));

        assertThat(wire.size()).isEqualTo(6);
        assertThat(wire.has("diff")).isFalse();
        assertThat(wire.get("verdict").asText()).isEqualTo(DecisionService.REJECTED);
    }

    @Test
    void theListingCarriesTheWindowTheTwoCountsAndTheValuesItApplied() {
        when(service.list("r-1", 20, 0)).thenReturn(List.of(decision("d-1")));
        when(service.count("r-1")).thenReturn(1L);

        ResponseEntity<DecisionList> answer = controller().list("r-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        DecisionList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(1);
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(LIST_FIELDS.length);
        for (String field : LIST_FIELDS) {
            assertThat(wire.has(field)).as("a decision listing must carry %s", field).isTrue();
        }
    }

    @Test
    void theListingReportsTheCapAndTheFloorItAppliedRatherThanWhatWasTyped() {
        when(service.list("r-1", 1000, 150)).thenReturn(List.of());
        when(service.count("r-1")).thenReturn(0L);

        DecisionList body = controller().list("r-1", 1000, 150).getBody();

        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(100);
    }

    @Test
    void readingOneAnswersTwoHundred() {
        when(service.read("d-1")).thenReturn(decision("d-1"));

        ResponseEntity<DecisionRecord> answer = controller().read("d-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().pullRequestId()).isEqualTo("r-1");
        assertThat(answer.getBody().verdict()).isEqualTo(DecisionService.APPROVED);
    }

    // ── the four tokens ───────────────────────────────────────────────────────────────────────────

    @Test
    void aBrokenDecisionIsAFourHundredThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller()
                .invalid(new InvalidDecision("the verdict \"Approved\" is not one of approved / rejected"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-decision");
        assertThat(answer.getBody().get("message")).contains("verdict");
    }

    @Test
    void anIdThatNamesNothingIsAFourHundredAndFourUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchDecision("decision \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-decision");
    }

    @Test
    void aDecisionAboutARequestThatDoesNotExistIsTheParentDoorsFourHundredAndFour() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absentParent(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pull-request");
    }

    @Test
    void aRequestThatIsNoLongerOpenIsAFourHundredAndNineThatNamesTheConflict() {
        ResponseEntity<Map<String, String>> answer = controller()
                .conflict(new AlreadyDecided("pull request \"r-1\" is no longer open — a verdict was already recorded for it"));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "already-decided");
        assertThat(answer.getBody().get("message")).contains("no longer open");
    }
}
