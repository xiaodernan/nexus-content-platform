package dev.nexus.api.incidents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.incidents.IncidentDtos.IncidentList;
import dev.nexus.api.incidents.IncidentDtos.IncidentRecord;
import dev.nexus.api.incidents.IncidentDtos.OpenIncident;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 v594 — the incident doors' HTTP envelope, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing case is {@link #anOpenRecordCarriesResolvedAtAsANullFieldRatherThanAnAbsence()}: a
 * caller must be able to tell "not resolved" from "this answer never mentions resolution", so the field is
 * pinned as present-and-null until the record is closed.
 */
@ExtendWith(MockitoExtension.class)
class IncidentControllerTest {

    private static final Instant AT = Instant.parse("2026-11-03T09:00:00Z");

    private static final String[] RECORD_FIELDS = {
            "id", "openedAt", "openedBy", "resolvedAt", "resolvedBy",
            "severity", "status", "summary", "targetId", "targetKind", "title"
    };

    private static final String[] LIST_FIELDS = {
            "count", "incidents", "limit", "offset", "severity", "status", "total"
    };

    @Mock
    private IncidentService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private IncidentController controller() {
        return new IncidentController(service);
    }

    private static Incident openRow(String id) {
        return new Incident(id, "the deploy lane is red", "the runner never finished", "high",
                "tool", "tool-1", IncidentService.OPEN, "acct-ada", AT);
    }

    private static Incident resolvedRow(String id, String resolvedBy) {
        Incident row = openRow(id);
        row.resolve(resolvedBy, AT.plusSeconds(60));
        return row;
    }

    // ── doors ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void openingAnswersTwoHundredAndOneWithTheElevenFields() throws Exception {
        when(service.open("red lane", null, "high", null, null, null)).thenReturn(openRow("i-1"));

        ResponseEntity<IncidentRecord> answer = controller()
                .open(new OpenIncident("red lane", null, "high", null, null, null));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        IncidentRecord body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("i-1");
        assertThat(body.title()).isEqualTo("the deploy lane is red");
        assertThat(body.status()).isEqualTo(IncidentService.OPEN);
        assertThat(body.openedAt()).isEqualTo(AT.toEpochMilli());
        assertThat(body.resolvedBy()).isNull();
        assertThat(body.resolvedAt()).isNull();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(RECORD_FIELDS.length);
        for (String field : RECORD_FIELDS) {
            assertThat(wire.has(field)).as("an incident must carry %s", field).isTrue();
        }
    }

    @Test
    void anOpenRecordCarriesResolvedAtAsANullFieldRatherThanAnAbsence() throws Exception {
        JsonNode wire = mapper.valueToTree(new IncidentRecord(
                "i-1", "red lane", null, "low", null, null, IncidentService.OPEN, null,
                AT.toEpochMilli(), null, null));

        assertThat(wire.has("resolvedAt")).isTrue();
        assertThat(wire.get("resolvedAt").isNull()).isTrue();
        assertThat(wire.get("resolvedBy").isNull()).isTrue();
    }

    @Test
    void theListingCarriesTheWindowTheTwoCountsAndTheValuesItApplied() throws Exception {
        when(service.list(20, 0, null, null)).thenReturn(List.of(openRow("i-2"), openRow("i-1")));
        when(service.count(null, null)).thenReturn(4L);

        ResponseEntity<?> answer = controller().list(null, null, null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        IncidentList body = (IncidentList) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.count()).isEqualTo(2);
        assertThat(body.total()).isEqualTo(4L);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();
        assertThat(body.status()).isNull();
        assertThat(body.severity()).isNull();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(LIST_FIELDS.length);
        for (String field : LIST_FIELDS) {
            assertThat(wire.has(field)).as("a listing must carry %s", field).isTrue();
        }
        verify(service).count(null, null);
    }

    @Test
    void theListingEchoesTheFiltersItApplied() throws Exception {
        when(service.list(20, 0, "open", "high")).thenReturn(List.of(openRow("i-1")));
        when(service.count("open", "high")).thenReturn(1L);

        ResponseEntity<?> answer = controller().list("open", "high", null, null);

        IncidentList body = (IncidentList) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.status()).isEqualTo("open");
        assertThat(body.severity()).isEqualTo("high");
    }

    @Test
    void theListingReportsTheCapAndTheFloorItAppliedRatherThanWhatWasTyped() throws Exception {
        when(service.list(1000, 150, null, null)).thenReturn(List.of());
        when(service.count(null, null)).thenReturn(0L);

        ResponseEntity<?> answer = controller().list(null, null, 1000, 150);

        IncidentList body = (IncidentList) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(IncidentService.MAX_LIST_LIMIT);
        // A window of 100 cannot skip 150: the page that contains row 150 starts at 100, and the answer says so.
        assertThat(body.offset()).isEqualTo(100);
    }

    @Test
    void aBlankFilterIsAFourHundredFromTheServiceBeforeTheWindowIsRead() {
        when(service.list(20, 0, "  ", null)).thenThrow(new InvalidIncident("the status filter is blank"));

        assertThatThrownBy(() -> controller().list("  ", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("blank");
        verify(service, never()).count(any(), any());
    }

    @Test
    void readingOneAnswersTwoHundredAndTheRecordAsItStands() {
        when(service.read("i-1")).thenReturn(resolvedRow("i-1", "ada"));

        ResponseEntity<IncidentRecord> answer = controller().read("i-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().status()).isEqualTo(IncidentService.RESOLVED);
        assertThat(answer.getBody().resolvedBy()).isEqualTo("ada");
        assertThat(answer.getBody().resolvedAt()).isEqualTo(AT.plusSeconds(60).toEpochMilli());
    }

    @Test
    void resolvingAnswersTwoHundredWithTheResolvedRecord() {
        when(service.resolve("i-1", "ada")).thenReturn(resolvedRow("i-1", "ada"));

        ResponseEntity<IncidentRecord> answer = controller()
                .resolve("i-1", new IncidentDtos.ResolveIncident("ada"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().status()).isEqualTo(IncidentService.RESOLVED);
        assertThat(answer.getBody().resolvedBy()).isEqualTo("ada");
        assertThat(answer.getBody().resolvedAt()).isEqualTo(AT.plusSeconds(60).toEpochMilli());
    }

    @Test
    void aResolveWithNoBodyPassesNoResolver() {
        when(service.resolve("i-1", null)).thenReturn(resolvedRow("i-1", null));

        ResponseEntity<IncidentRecord> answer = controller().resolve("i-1", null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().resolvedBy()).isNull();
    }

    // ── the three tokens ──────────────────────────────────────────────────────────────────────────

    @Test
    void aBrokenRuleIsAFourHundredThatNamesIt() {
        ResponseEntity<Map<String, String>> answer = controller().invalid(
                new InvalidIncident("severity \"High\" is not a severity this service knows"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-incident");
        assertThat(answer.getBody().get("message")).contains("High");
    }

    @Test
    void anIdThatNamesNothingIsAFourHundredAndFourUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .absent(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-incident");
        assertThat(answer.getBody().get("message")).contains("nope");
    }

    @Test
    void aSecondResolveIsAConflictUnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer = controller()
                .already(new AlreadyResolved("incident \"i-1\" is already resolved"));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "already-resolved");
    }
}
