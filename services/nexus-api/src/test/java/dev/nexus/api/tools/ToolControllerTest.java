package dev.nexus.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M10 v571 — the registry's HTTP surface, graded directly (no Spring context, no database).
 *
 * <p>The load-bearing cases are the wire shape's bounds: a read answer carries NO execution field (no url,
 * no invocation count), the listing's echoed limit is the limit the answer actually applied, and a removal
 * without an owner touches nothing.
 */
@ExtendWith(MockitoExtension.class)
class ToolControllerTest {

    private static final Instant AT = Instant.parse("2026-11-02T08:00:00Z");
    private static final String OWNER = "acct-ada";

    @Mock
    private ToolService service;

    private final ObjectMapper mapper = new ObjectMapper();

    private ToolController controller() {
        return new ToolController(service);
    }

    private ToolEntry row(String id, String owner, String name) {
        return new ToolEntry(id, owner, name, "a tool", "{}", AT);
    }

    private JsonNode emptyObject() throws Exception {
        return mapper.readTree("{}");
    }

    @Test
    void declaringAToolAnswersTwoHundredAndOneWithTheRow() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.register(OWNER, "a.tool", "a tool", emptyObject()))
                .thenReturn(stored);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.Tool> answer = controller()
                .register(new ToolDtos.RegisterRequest(OWNER, "a.tool", "a tool", emptyObject()));

        assertThat(answer.getStatusCode().value()).isEqualTo(201);
        ToolDtos.Tool body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("tool-1");
        assertThat(body.owner()).isEqualTo(OWNER);
        assertThat(body.name()).isEqualTo("a.tool");
        assertThat(body.summary()).isEqualTo("a tool");
        assertThat(body.inputSchema().isObject()).isTrue();
        assertThat(body.createdAt()).isEqualTo(AT.toEpochMilli());

        JsonNode wire = mapper.valueToTree(body);
        // The registry declares, it does not execute: an answer must carry no capability field.
        for (String forbidden : new String[] {"url", "endpoint", "command", "invocationCount", "lastCalledAt"}) {
            assertThat(wire.has(forbidden)).as("wire field %s", forbidden).isFalse();
        }
    }

    @Test
    void theCatalogAnswersTheWindowTheCountAndTheFilterItApplied() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.catalog(null, 20, 0)).thenReturn(List.of(stored));
        when(service.countOf(null)).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.ToolList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.owner()).isNull();
        assertThat(body.tools()).hasSize(1);
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.limit()).isEqualTo(ToolService.DEFAULT_LIST_LIMIT);
        assertThat(body.offset()).isZero();

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.get("tools").get(0).has("url")).isFalse();
        assertThat(wire.get("tools").get(0).get("inputSchema").isObject()).isTrue();
    }

    @Test
    void theListingClampsTheLimitItReportsAndFloorsTheOffset() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.catalog(null, 500, 0)).thenReturn(List.of(stored));
        when(service.countOf(null)).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, 500, -10);

        ToolDtos.ToolList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(ToolService.MAX_LIST_LIMIT);
        assertThat(body.offset()).isZero();
    }

    @Test
    void theOwnerFilterIsEchoedTrimmedWhileTheWindowSeesTheOriginal() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.catalog("  acct-ada  ", 20, 0)).thenReturn(List.of(stored));
        when(service.countOf("  acct-ada  ")).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list("  acct-ada  ", null, null);

        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().owner()).isEqualTo(OWNER);
        assertThat(answer.getBody().tools()).hasSize(1);
    }

    @Test
    void removingAnswersTwoHundredEitherWay() {
        when(service.remove("tool-1", OWNER)).thenReturn(true);
        ResponseEntity<Map<String, Object>> removed = controller().remove("tool-1", OWNER);
        assertThat(removed.getStatusCode().value()).isEqualTo(200);
        assertThat(removed.getBody()).containsEntry("ok", true).containsEntry("removed", true);

        when(service.remove("tool-missing", OWNER)).thenReturn(false);
        ResponseEntity<Map<String, Object>> alreadyGone = controller().remove("tool-missing", OWNER);
        assertThat(alreadyGone.getStatusCode().value()).isEqualTo(200);
        assertThat(alreadyGone.getBody()).containsEntry("removed", false);
    }

    @Test
    void aRemovalWithoutAnOwnerIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<Map<String, Object>> answer = controller().remove("tool-1", "  ");
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-tool");
        assertThat((String) answer.getBody().get("message")).contains("owner");
        verifyNoInteractions(service);
    }

    @Test
    void aRuleTheCallerBrokeIsAFourHundredFromTheService() {
        ResponseEntity<Map<String, String>> answer = controller().invalid(
                new InvalidTool("a tool's inputSchema must be a JSON OBJECT — this one is array"));
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-tool");
        assertThat(answer.getBody().get("message")).contains("JSON OBJECT");
    }

    @Test
    void aTakenNameIsAConflictAndSomebodyElsesRowIsForbidden() {
        ResponseEntity<Map<String, String>> taken = controller().taken(new ToolNameTaken("held by tool tool-1"));
        assertThat(taken.getStatusCode().value()).isEqualTo(409);
        assertThat(taken.getBody()).containsEntry("error", "tool-name-taken");

        ResponseEntity<Map<String, String>> notYours = controller().notYours(new NotYourTool("belongs to another account"));
        assertThat(notYours.getStatusCode().value()).isEqualTo(403);
        assertThat(notYours.getBody()).containsEntry("error", "not-your-tool");
    }

    @Test
    void readingOneToolAnswersItsRow() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.get("tool-1")).thenReturn(stored);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.Tool> answer = controller().read("tool-1");

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().id()).isEqualTo("tool-1");
        assertThat(answer.getBody().name()).isEqualTo("a.tool");
        assertThat(answer.getBody().createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(mapper.valueToTree(answer.getBody()).has("url")).isFalse();
    }

    @Test
    void updatingAnswersTheReplacedRow() throws Exception {
        ToolEntry replaced = new ToolEntry("tool-1", OWNER, "a.tool", "A better sentence.", "{\"type\":\"object\"}", AT);
        when(service.update("tool-1", "  acct-ada  ", "A better sentence.", emptyObject())).thenReturn(replaced);
        when(service.schemaOf(replaced)).thenReturn(emptyObject());

        ResponseEntity<?> answer = controller()
                .update("tool-1", "  acct-ada  ", new ToolDtos.UpdateRequest("A better sentence.", emptyObject()));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.Tool body = (ToolDtos.Tool) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("tool-1");
        assertThat(body.summary()).isEqualTo("A better sentence.");
        assertThat(body.name()).isEqualTo("a.tool");
    }

    @Test
    @SuppressWarnings("unchecked")
    void anUpdateWithoutAnOwnerIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<?> answer = controller().update("tool-1", "  ", new ToolDtos.UpdateRequest("a tool", null));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        Map<String, Object> body = (Map<String, Object>) answer.getBody();
        assertThat(body).containsEntry("error", "invalid-tool");
        assertThat((String) body.get("message")).contains("owner");
        verifyNoInteractions(service);
    }

    @Test
    void anUnknownToolIsAFourHundredAndFourFromTheService() {
        ResponseEntity<Map<String, String>> answer =
                controller().unknown(new UnknownTool("tool \"x\" names nothing in this registry"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-tool");
        assertThat(answer.getBody().get("message")).contains("names nothing");
    }
    @Test
    void aHistoryAnswersTheWindowAndTheWholeCountWithNoCapabilityField() throws Exception {
        ToolRevision newest = new ToolRevision("tool-1", 2, "A better sentence.", "{\"type\":\"object\"}", AT);
        ToolRevision first = new ToolRevision("tool-1", 1, "a tool", "{}", AT.minusSeconds(60));
        when(service.history("tool-1", 20, 0)).thenReturn(List.of(newest, first));
        when(service.revisionCount("tool-1")).thenReturn(2L);
        when(service.schemaOf(newest)).thenReturn(emptyObject());
        when(service.schemaOf(first)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolRevisionList> answer = controller().revisions("tool-1", null, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.ToolRevisionList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.total()).isEqualTo(2);
        assertThat(body.limit()).isEqualTo(20);
        assertThat(body.offset()).isZero();
        assertThat(body.revisions()).extracting(ToolDtos.ToolRevisionView::revision).containsExactly(2, 1);
        assertThat(body.revisions().get(0).recordedAt()).isEqualTo(AT.toEpochMilli());
        assertThat(body.revisions().get(1).summary()).isEqualTo("a tool");

        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.has("revisions")).isTrue();
        assertThat(wire.toString()).doesNotContain("url").doesNotContain("invocation").doesNotContain("secret");
    }

    @Test
    void aHistoryReportsTheLimitItActuallyApplied() throws Exception {
        when(service.history("tool-1", 500, 7)).thenReturn(List.of());
        when(service.revisionCount("tool-1")).thenReturn(0L);

        ResponseEntity<ToolDtos.ToolRevisionList> answer = controller().revisions("tool-1", 500, 7);

        ToolDtos.ToolRevisionList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(7);
        assertThat(body.revisions()).isEmpty();
    }

    @Test
    void aHistoryOfAnUnknownToolReachesTheSameFourHundredAndFour() {
        when(service.history("tool-missing", 20, 0))
                .thenThrow(new UnknownTool("tool \"tool-missing\" names nothing in this registry"));

        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> controller().revisions("tool-missing", null, null)))
                .isInstanceOf(UnknownTool.class);
    }
}
