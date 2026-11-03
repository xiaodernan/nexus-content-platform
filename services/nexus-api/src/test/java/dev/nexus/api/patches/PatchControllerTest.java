package dev.nexus.api.patches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.incidents.NoSuchIncident;
import dev.nexus.api.patches.PatchDtos.OpenPatch;
import dev.nexus.api.patches.PatchDtos.PatchList;
import dev.nexus.api.patches.PatchDtos.PatchRecord;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v595 — the patch doors' HTTP envelope, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #aDiffWithNewlinesAndTabsSurvivesTheWire()}: the bytes are the record,
 * so a serializer that normalized them would make every read a different patch than the one written.
 */
@ExtendWith(MockitoExtension.class)
class PatchControllerTest {

    private static final Instant AT = Instant.parse("2026-11-03T10:00:00Z");

    private static final String[] RECORD_FIELDS = {
            "author", "createdAt", "diff", "id", "incidentId", "status", "summary", "title"
    };

    private static final String[] LIST_FIELDS = {"count", "limit", "offset", "patches", "total"};

    private static final String DIFF = "  context line\n\tdetail line\n\n";

    @Mock
    private PatchService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private PatchController controller() {
        return new PatchController(service);
    }

    private static IncidentPatch patch(String id) {
        return new IncidentPatch(id, "i-1", "fix the lane", "because it is red", DIFF, "ada",
                PatchService.PROPOSED, AT);
    }

    // ── doors ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void proposingAnswersTwoHundredAndOneWithTheEightFields() throws Exception {
        when(service.open("i-1", "fix the lane", "because it is red", DIFF, "ada"))
                .thenReturn(patch("p-1"));

        ResponseEntity<PatchRecord> answer = controller().open(
                "i-1", new OpenPatch("fix the lane", "because it is red", DIFF, "ada"));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        PatchRecord body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("p-1");
        assertThat(body.incidentId()).isEqualTo("i-1");
        assertThat(body.diff()).isEqualTo(DIFF);
        assertThat(body.status()).isEqualTo(PatchService.PROPOSED);
        assertThat(body.createdAt()).isEqualTo(AT.toEpochMilli());

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(RECORD_FIELDS.length);
        for (String field : RECORD_FIELDS) {
            assertThat(wire.has(field)).as("a patch must carry %s", field).isTrue();
        }
    }

    @Test
    void aDiffWithNewlinesAndTabsSurvivesTheWire() {
        JsonNode wire = mapper.valueToTree(new PatchRecord(
                "p-1", "i-1", "fix the lane", "because it is red", DIFF, "ada",
                PatchService.PROPOSED, AT.toEpochMilli()));

        assertThat(wire.get("diff").asText()).isEqualTo(DIFF);
        assertThat(wire.get("diff").asText()).contains("\n").contains("\t").endsWith("\n\n");
    }

    @Test
    void theListingCarriesTheWindowTheTwoCountsAndTheValuesItApplied() throws Exception {
        when(service.list("i-1", 20, 0)).thenReturn(List.of(patch("p-2"), patch("p-1")));
        when(service.count("i-1")).thenReturn(3L);

        ResponseEntity<PatchList> answer = controller().list("i-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        PatchList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(2);
        assertThat(body.total()).isEqualTo(3L);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(LIST_FIELDS.length);
        for (String field : LIST_FIELDS) {
            assertThat(wire.has(field)).as("a patch listing must carry %s", field).isTrue();
        }
    }

    @Test
    void theListingReportsTheCapAndTheFloorItAppliedRatherThanWhatWasTyped() {
        when(service.list("i-1", 1000, 150)).thenReturn(List.of());
        when(service.count("i-1")).thenReturn(0L);

        PatchList body = controller().list("i-1", 1000, 150).getBody();

        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(100);
    }

    @Test
    void readingOneAnswersTwoHundredWithTheBytes() {
        when(service.read("p-1")).thenReturn(patch("p-1"));

        ResponseEntity<PatchRecord> answer = controller().read("p-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().diff()).isEqualTo(DIFF);
        assertThat(answer.getBody().incidentId()).isEqualTo("i-1");
    }

    // ── the three tokens ──────────────────────────────────────────────────────────────────────────

    @Test
    void aBrokenProposalIsAFourHundredThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller()
                .invalid(new InvalidPatch("a patch needs bytes — a diff that is only whitespace proposes nothing"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-patch");
        assertThat(answer.getBody().get("message")).contains("bytes");
    }

    @Test
    void anIdThatNamesNothingIsAFourHundredAndFourUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchPatch("patch \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-patch");
    }

    @Test
    void aPatchNamingAnIncidentThatDoesNotExistIsTheParentDoorsFourHundredAndFour() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absentParent(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-incident");
    }
}
