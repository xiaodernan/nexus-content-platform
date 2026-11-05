package dev.nexus.api.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
        when(service.catalog(null, null, null, null, null, 20, 0)).thenReturn(List.of(stored));
        when(service.countOf(null, null, null, null)).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, null, null, null, null, null, null);

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
        when(service.catalog(null, null, null, null, null, 500, 0)).thenReturn(List.of(stored));
        when(service.countOf(null, null, null, null)).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, null, null, null, null, 500, -10);

        ToolDtos.ToolList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(ToolService.MAX_LIST_LIMIT);
        assertThat(body.offset()).isZero();
    }

    @Test
    void theOwnerFilterIsEchoedTrimmedWhileTheWindowSeesTheOriginal() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.catalog("  acct-ada  ", null, null, null, null, 20, 0)).thenReturn(List.of(stored));
        when(service.countOf("  acct-ada  ", null, null, null)).thenReturn(1L);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list("  acct-ada  ", null, null, null, null, null, null);

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

        ResponseEntity<ToolDtos.Tool> answer = controller().read("tool-1", null);

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
        when(service.history("tool-1", null, 20, 0)).thenReturn(List.of(newest, first));
        when(service.revisionCount("tool-1", null)).thenReturn(2L);
        when(service.schemaOf(newest)).thenReturn(emptyObject());
        when(service.schemaOf(first)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolRevisionList> answer = controller().revisions("tool-1", null, null, null);

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
        when(service.history("tool-1", null, 500, 7)).thenReturn(List.of());
        when(service.revisionCount("tool-1", null)).thenReturn(0L);

        ResponseEntity<ToolDtos.ToolRevisionList> answer = controller().revisions("tool-1", null, 500, 7);

        ToolDtos.ToolRevisionList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(100);
        assertThat(body.offset()).isEqualTo(7);
        assertThat(body.revisions()).isEmpty();
    }

    @Test
    void aHistoryOfAnUnknownToolReachesTheSameFourHundredAndFour() {
        when(service.history("tool-missing", null, 20, 0))
                .thenThrow(new UnknownTool("tool \"tool-missing\" names nothing in this registry"));

        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> controller().revisions("tool-missing", null, null, null)))
                .isInstanceOf(UnknownTool.class);
    }
    @Test
    void aDeclarationIsAnsweredByItsGlobalNameWithTheSameSevenFields() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(service.getByName("a.tool")).thenReturn(mine);
        when(service.schemaOf(mine)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.Tool> answer = controller().readByName("a.tool", null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.Tool body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("tool-1");
        assertThat(body.name()).isEqualTo("a.tool");
        assertThat(body.inputSchema().isObject()).isTrue();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }
    @Test
    void deprecatingAnswersTheSentenceAndHint() {
        ToolDeprecation stored = new ToolDeprecation("tool-1", "Use b.tool instead.", "b.tool", AT);
        when(service.deprecate("tool-1", OWNER, "Use b.tool instead.", "b.tool")).thenReturn(stored);
        when(service.resolveReplacement("b.tool"))
                .thenReturn(new ToolService.ReplacementResolution("live", "tool-2"));

        ResponseEntity<?> answer = controller()
                .deprecate("tool-1", OWNER, new ToolDtos.DeprecateRequest("Use b.tool instead.", "b.tool"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.Deprecation body = (ToolDtos.Deprecation) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.message()).isEqualTo("Use b.tool instead.");
        assertThat(body.replacement()).isEqualTo("b.tool");
        assertThat(body.replacementStatus()).isEqualTo("live");
        assertThat(body.replacementToolId()).isEqualTo("tool-2");
        assertThat(body.deprecatedAt()).isEqualTo(AT.toEpochMilli());
        assertThat(mapper.valueToTree(body).size()).isEqualTo(6);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aDeprecationWithoutAnOwnerIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<?> answer = controller().deprecate("tool-1", "  ", new ToolDtos.DeprecateRequest("x", null));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        Map<String, Object> body = (Map<String, Object>) answer.getBody();
        assertThat(body).containsEntry("error", "invalid-tool");
        assertThat((String) body.get("message")).contains("owner");
        verifyNoInteractions(service);
    }

    @Test
    void withdrawingADeprecationAnswersRemoved() {
        when(service.undeprecate("tool-1", OWNER)).thenReturn(true);

        ResponseEntity<Map<String, Object>> answer = controller().undeprecate("tool-1", OWNER);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).containsEntry("toolId", "tool-1").containsEntry("removed", true);
    }

    @Test
    void theDeprecatedListCarriesEachToolsNameBesideItsDeprecation() throws Exception {
        when(service.deprecationPage(null, null, null, 20, 0))
                .thenReturn(List.of(new ToolDeprecation("tool-1", "Use b.tool instead.", "b.tool", AT)));
        when(service.deprecationCount(null, null)).thenReturn(1L);
        when(service.byIds(List.of("tool-1"))).thenReturn(Map.of("tool-1", row("tool-1", OWNER, "a.tool")));
        when(service.resolveReplacements(List.of("b.tool")))
                .thenReturn(Map.of("b.tool", new ToolService.ReplacementResolution("live", "tool-2")));

        ResponseEntity<ToolDtos.DeprecationList> answer = controller().deprecations(null, null, null, null, null);

        ToolDtos.DeprecationList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.total()).isEqualTo(1);
        assertThat(body.deprecations()).extracting(ToolDtos.DeprecatedTool::name).containsExactly("a.tool");
        assertThat(body.deprecations().get(0).replacement()).isEqualTo("b.tool");
        assertThat(body.deprecations().get(0).replacementStatus()).isEqualTo("live");
        assertThat(body.deprecations().get(0).replacementToolId()).isEqualTo("tool-2");
        assertThat(body.before()).isNull();
        assertThat(body.owner()).isNull();
        assertThat(mapper.valueToTree(body.deprecations().get(0)).size()).isEqualTo(7);
        JsonNode wire = mapper.valueToTree(body);
        assertThat(wire.size()).isEqualTo(7);
        assertThat(wire.toString()).doesNotContain("secret").doesNotContain(OWNER);
    }

    @Test
    void theDeprecationCursorIsEchoedTrimmedAndDoesNotNarrowTheTotal() throws Exception {
        String key = AT.toEpochMilli() + ":tool-1";
        when(service.deprecationPage(null, null, key, 20, 0))
                .thenReturn(List.of(new ToolDeprecation("tool-2", "Going away.", null, AT.minusSeconds(1))));
        when(service.deprecationCount(null, null)).thenReturn(3L);
        when(service.byIds(List.of("tool-2"))).thenReturn(Map.of("tool-2", row("tool-2", OWNER, "b.tool")));

        ToolDtos.DeprecationList body =
                controller().deprecations(null, null, "  " + AT.toEpochMilli() + ": tool-1  ", null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.before()).as("the cursor is echoed in the canonical <epochMillis>:<toolId> shape")
                .isEqualTo(key);
        assertThat(body.total()).as("a cursor is a position, not a filter").isEqualTo(3L);
        assertThat(body.deprecations()).extracting(ToolDtos.DeprecatedTool::name).containsExactly("b.tool");
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void aDeprecationCursorThatIsNotAPairIsRefusedBeforeTheServiceIsAsked() {
        assertThatThrownBy(() -> controller().deprecations(null, null, "tool-1", null, null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("<epochMillis>:<toolId>");
        verifyNoInteractions(service);
    }

    @Test
    void theOwnerFilterIsEchoedAndTheCountIsTheNarrowedWhole() throws Exception {
        when(service.deprecationPage(OWNER, null, null, 20, 0))
                .thenReturn(List.of(new ToolDeprecation("tool-1", "Going away.", null, AT)));
        when(service.deprecationCount(OWNER, null)).thenReturn(1L);
        when(service.byIds(List.of("tool-1"))).thenReturn(Map.of("tool-1", row("tool-1", OWNER, "a.tool")));

        ToolDtos.DeprecationList body =
                controller().deprecations(null, null, null, "  " + OWNER + "  ", null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.owner()).as("the owner filter is echoed trimmed").isEqualTo(OWNER);
        assertThat(body.total()).isEqualTo(1);
        assertThat(body.before()).isNull();
        assertThat(body.deprecations().get(0).replacementStatus()).isEqualTo("none");
        assertThat(body.deprecations().get(0).replacementToolId()).isNull();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void aListRowSaysWhenItsReplacementNamesNothingYet() {
        when(service.deprecationPage(null, null, null, 20, 0))
                .thenReturn(List.of(new ToolDeprecation("tool-1", "Use the successor.", "later.tool", AT)));
        when(service.deprecationCount(null, null)).thenReturn(1L);
        when(service.byIds(List.of("tool-1"))).thenReturn(Map.of("tool-1", row("tool-1", OWNER, "a.tool")));
        when(service.resolveReplacements(List.of("later.tool")))
                .thenReturn(Map.of("later.tool", new ToolService.ReplacementResolution("unresolved", null)));

        ToolDtos.DeprecationList body = controller().deprecations(null, null, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.deprecations().get(0).replacement()).isEqualTo("later.tool");
        assertThat(body.deprecations().get(0).replacementStatus()).isEqualTo("unresolved");
        assertThat(body.deprecations().get(0).replacementToolId()).isNull();
    }

    @Test
    void theReplacementStatusFilterIsEchoedAndTheCountFollowsIt() throws Exception {
        when(service.deprecationPage(OWNER, "unresolved", null, 20, 0))
                .thenReturn(List.of(new ToolDeprecation("tool-1", "Use the successor.", "later.tool", AT)));
        when(service.deprecationCount(OWNER, "unresolved")).thenReturn(1L);
        when(service.byIds(List.of("tool-1"))).thenReturn(Map.of("tool-1", row("tool-1", OWNER, "a.tool")));
        when(service.resolveReplacements(List.of("later.tool")))
                .thenReturn(Map.of("later.tool", new ToolService.ReplacementResolution("unresolved", null)));

        ToolDtos.DeprecationList body =
                controller().deprecations(null, null, null, "  " + OWNER + "  ", "  unresolved  ").getBody();

        assertThat(body).isNotNull();
        assertThat(body.owner()).isEqualTo(OWNER);
        assertThat(body.replacementStatus()).as("the derived-state filter is echoed trimmed").isEqualTo("unresolved");
        assertThat(body.total()).isEqualTo(1);
        assertThat(body.deprecations().get(0).replacementStatus()).isEqualTo("unresolved");
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void aReplacementStatusOutsideTheClosedVocabularyIsRefusedBeforeTheServiceIsAsked() {
        assertThatThrownBy(() -> controller().deprecations(null, null, null, null, "gone"))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("none")
                .hasMessageContaining("deprecated");
        verifyNoInteractions(service);
    }

    @Test
    void aSingleDeprecationSaysWhenItsSuccessorIsItselfDeparting() {
        ToolDeprecation row = new ToolDeprecation("tool-1", "Use b.tool.", "b.tool", AT);
        when(service.deprecationOf("tool-1")).thenReturn(row);
        when(service.resolveReplacement("b.tool"))
                .thenReturn(new ToolService.ReplacementResolution("deprecated", "tool-2"));

        ToolDtos.Deprecation body = controller().deprecation("tool-1").getBody();

        assertThat(body).isNotNull();
        assertThat(body.replacementStatus()).isEqualTo("deprecated");
        assertThat(body.replacementToolId()).isEqualTo("tool-2");
    }

    @Test
    void aLiveToolIsAFourHundredAndFourUnderTheNameNotDeprecated() {
        ResponseEntity<Map<String, String>> answer =
                controller().notDeprecated(new UnknownDeprecation("tool \"tool-1\" is not deprecated"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "not-deprecated");
    }
    @Test
    void theCatalogEchoesTheSearchItApplied() throws Exception {
        ToolEntry match = row("tool-1", OWNER, "weather.lookup");
        when(service.catalog(null, "  weather  ", null, null, null, 20, 0)).thenReturn(List.of(match));
        when(service.countOf(null, "  weather  ", null, null)).thenReturn(1L);
        when(service.schemaOf(match)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, "  weather  ", null, null, null, null, null);

        ToolDtos.ToolList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.query()).as("the answer echoes the trimmed search it applied").isEqualTo("weather");
        assertThat(body.total()).isEqualTo(1);
        assertThat(body.tools()).extracting(ToolDtos.Tool::name).containsExactly("weather.lookup");
    }

    @Test
    void aSearchLongerThanTheBoundIsRefusedBeforeTheServiceIsAsked() {
        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().list(null, "x".repeat(101), null, null, null, null, null));

        assertThat(refused).isInstanceOf(InvalidTool.class);
        assertThat(refused.getMessage()).contains("101");
        verifyNoInteractions(service);
    }
    // ── v578: the pin, and the conditional read it makes possible ─────────────────────────────────────
    private static final String PIN = "61a98b7253feb4139f9e031f6bedc00f917353564cf627e5f3b603be5c9891a7";

    @Test
    void aWholeDeclarationCarriesItsPinAsAFieldAndAsAStrongETag() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.get("tool-1")).thenReturn(stored);
        when(service.contractSha256(stored)).thenReturn(PIN);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.Tool> answer = controller().read("tool-1", null);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().contractSha256()).isEqualTo(PIN);
        // Quoted, because an ETag is a quoted-string; strong, because the value is a digest of these bytes.
        assertThat(answer.getHeaders().getETag()).isEqualTo("\"" + PIN + "\"");
    }

    @Test
    void askingForThePinTheCallerAlreadyHoldsIsA304WithNoBody() {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.get("tool-1")).thenReturn(stored);
        when(service.contractSha256(stored)).thenReturn(PIN);

        ResponseEntity<ToolDtos.Tool> answer = controller().read("tool-1", "\"" + PIN + "\"");

        assertThat(answer.getStatusCode().value()).isEqualTo(304);
        assertThat(answer.getBody()).isNull();
        assertThat(answer.getHeaders().getETag()).isEqualTo("\"" + PIN + "\"");
        // The schema was never parsed: a 304 is cheaper than the answer it replaces, not a slower one.
        verify(service, org.mockito.Mockito.never()).schemaOf(any(ToolEntry.class));
    }

    @Test
    void aTagThatNamesAnotherContractStillAnswersTheDeclaration() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.get("tool-1")).thenReturn(stored);
        when(service.contractSha256(stored)).thenReturn(PIN);
        when(service.schemaOf(stored)).thenReturn(emptyObject());

        String stale = "\"" + "0".repeat(64) + "\"";
        ResponseEntity<ToolDtos.Tool> answer = controller().read("tool-1", stale);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().contractSha256()).isEqualTo(PIN);
    }

    @Test
    void aStarTagNamesAnyExistingDeclaration() throws Exception {
        ToolEntry stored = row("tool-1", OWNER, "a.tool");
        when(service.get("tool-1")).thenReturn(stored);
        when(service.contractSha256(stored)).thenReturn(PIN);

        assertThat(controller().read("tool-1", "*").getStatusCode().value()).isEqualTo(304);
    }

    @Test
    void aTagIsMatchedHoweverAClientSpellsIt() {
        assertThat(ToolController.matchesPin(null, PIN)).isFalse();
        assertThat(ToolController.matchesPin("   ", PIN)).isFalse();
        assertThat(ToolController.matchesPin(PIN, PIN)).isTrue();
        assertThat(ToolController.matchesPin("\"" + PIN + "\"", PIN)).isTrue();
        assertThat(ToolController.matchesPin("W/\"" + PIN + "\"", PIN)).isTrue();
        assertThat(ToolController.matchesPin("\"deadbeef\", \"" + PIN + "\"", PIN)).isTrue();
        assertThat(ToolController.matchesPin("\"deadbeef\"", PIN)).isFalse();
        assertThat(ToolController.matchesPin("*", PIN)).isTrue();
        // An empty pin cannot be matched by anything: a row whose contract could not be read is not "current".
        assertThat(ToolController.matchesPin("*", null)).isFalse();
    }

    @Test
    void anUnknownIdIsA404EvenWhenTheCallerSentATag() {
        when(service.get("tool-missing"))
                .thenThrow(new UnknownTool("tool \"tool-missing\" names nothing in this registry"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().read("tool-missing", "*"));

        assertThat(refused).isInstanceOf(UnknownTool.class);
    }

    @Test
    void aReadByNameAnswersTheSamePinAndHonoursTheSameTag() throws Exception {
        ToolEntry mine = row("tool-1", OWNER, "a.tool");
        when(service.getByName("a.tool")).thenReturn(mine);
        when(service.contractSha256(mine)).thenReturn(PIN);
        when(service.schemaOf(mine)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.Tool> fresh = controller().readByName("a.tool", null);
        ResponseEntity<ToolDtos.Tool> notModified = controller().readByName("a.tool", "\"" + PIN + "\"");

        assertThat(fresh.getBody()).isNotNull();
        assertThat(fresh.getBody().contractSha256()).isEqualTo(PIN);
        assertThat(notModified.getStatusCode().value()).isEqualTo(304);
        assertThat(notModified.getBody()).isNull();
    }

    // ── v579: the handover door and the chain of holders ─────────────────────────────────────────────
    @Test
    @SuppressWarnings("unchecked")
    void aTransferWithoutAnOwnerIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<?> answer = controller().transfer("tool-1", "  ", new ToolDtos.TransferRequest("acct-bob"));

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        Map<String, Object> body = (Map<String, Object>) answer.getBody();
        assertThat(body).containsEntry("error", "invalid-tool");
        assertThat((String) body.get("message")).contains("owner");
        verifyNoInteractions(service);
    }

    @Test
    void aTransferAnswersTheSameDeclarationWithItsNewOwner() throws Exception {
        ToolEntry handedOver = new ToolEntry("tool-1", "acct-bob", "a.tool", "a tool", "{}", AT);
        when(service.transfer("tool-1", OWNER, "acct-bob")).thenReturn(handedOver);
        when(service.schemaOf(handedOver)).thenReturn(emptyObject());

        ResponseEntity<?> answer = controller()
                .transfer("tool-1", OWNER, new ToolDtos.TransferRequest("acct-bob"));

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.Tool body = (ToolDtos.Tool) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.id()).isEqualTo("tool-1");
        assertThat(body.name()).isEqualTo("a.tool");
        assertThat(body.owner()).isEqualTo("acct-bob");
        // The pin travels on this answer too: a handover does not invalidate what a consumer pinned.
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void aTransferWithoutABodyStillReachesTheServiceWithNoTargetSoTheRuleNamesIt() {
        when(service.transfer("tool-1", OWNER, null)).thenThrow(new InvalidTool("a transfer needs the account that receives the tool"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().transfer("tool-1", OWNER, null));

        assertThat(refused).isInstanceOf(InvalidTool.class);
    }

    @Test
    void theChainOfHoldersNamesTheCurrentHolderAndTheWindowItApplied() {
        ToolEntry mine = new ToolEntry("tool-1", "acct-cy", "a.tool", "a tool", "{}", AT);
        when(service.get("tool-1")).thenReturn(mine);
        when(service.ownershipHistory("tool-1", 500, 0))
                .thenReturn(List.of(new ToolOwnership("tool-1", 2, "acct-bob", "acct-cy", AT)));
        when(service.ownershipCount("tool-1")).thenReturn(2L);

        ResponseEntity<ToolDtos.OwnershipChain> answer = controller().ownership("tool-1", 500, -3);

        ToolDtos.OwnershipChain body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.owner()).isEqualTo("acct-cy");
        assertThat(body.total()).isEqualTo(2L);
        assertThat(body.limit()).isEqualTo(ToolService.MAX_LIST_LIMIT);
        assertThat(body.offset()).isZero();
        assertThat(body.transfers()).hasSize(1);
        assertThat(body.transfers().get(0).transfer()).isEqualTo(2);
        assertThat(body.transfers().get(0).from()).isEqualTo("acct-bob");
        assertThat(body.transfers().get(0).to()).isEqualTo("acct-cy");
        assertThat(body.transfers().get(0).transferredAt()).isEqualTo(AT.toEpochMilli());
    }

    @Test
    void aChainOfAnUnknownToolIsA404RatherThanAnEmptyChain() {
        when(service.get("tool-missing"))
                .thenThrow(new UnknownTool("tool \"tool-missing\" names nothing in this registry"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().ownership("tool-missing", null, null));

        assertThat(refused).isInstanceOf(UnknownTool.class);
    }

    // ── v580: the history narrowed to what came after a revision the caller holds ────────────────────
    @Test
    void theHistoryEchoesTheSinceItApplied() {
        when(service.history("tool-1", 4, 20, 0))
                .thenReturn(List.of(new ToolRevision("tool-1", 5, "fifth", "{}", AT)));
        when(service.revisionCount("tool-1", 4)).thenReturn(1L);

        ResponseEntity<ToolDtos.ToolRevisionList> answer = controller().revisions("tool-1", 4, null, null);

        ToolDtos.ToolRevisionList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.since()).isEqualTo(4);
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.revisions()).hasSize(1);
    }

    @Test
    void aHistoryWithoutASinceEchoesNullRatherThanZero() {
        when(service.history("tool-1", null, 20, 0)).thenReturn(List.of());
        when(service.revisionCount("tool-1", null)).thenReturn(0L);

        ToolDtos.ToolRevisionList body = controller().revisions("tool-1", null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.since()).isNull();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(6);
    }

    @Test
    void aNegativeSinceIsRefusedBeforeTheWindowIsReported() {
        when(service.history("tool-1", -2, 20, 0)).thenReturn(List.of());

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().revisions("tool-1", -2, null, null));

        assertThat(refused).isInstanceOf(InvalidTool.class);
        assertThat(refused.getMessage()).contains("0 or more");
    }

    // ── v581: the retention door ──────────────────────────────────────────────────────────────────────
    @Test
    @SuppressWarnings("unchecked")
    void aPruneWithoutAnOwnerIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<?> answer = controller().pruneRevisions("tool-1", "  ", 2);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        Map<String, Object> body = (Map<String, Object>) answer.getBody();
        assertThat(body).containsEntry("error", "invalid-tool");
        assertThat((String) body.get("message")).contains("owner");
        verifyNoInteractions(service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aPruneWithoutABoundIsRefusedBeforeAnythingIsRead() {
        ResponseEntity<?> answer = controller().pruneRevisions("tool-1", OWNER, null);

        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        Map<String, Object> body = (Map<String, Object>) answer.getBody();
        assertThat((String) body.get("message")).contains("before");
        verifyNoInteractions(service);
    }

    @Test
    void aPruneAnswersTheBoundWhatWentAndWhatRemains() {
        when(service.pruneRevisions("tool-1", OWNER, 2)).thenReturn(1);
        when(service.revisionCount("tool-1", null)).thenReturn(2L);

        ResponseEntity<?> answer = controller().pruneRevisions("tool-1", OWNER, 2);

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        ToolDtos.PruneRevisionsAnswer body = (ToolDtos.PruneRevisionsAnswer) answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.before()).isEqualTo(2);
        assertThat(body.pruned()).isEqualTo(1);
        assertThat(body.remaining()).isEqualTo(2L);
    }

    // ── v582: the catalog can name the rows that are going away ──────────────────────────────────────
    @Test
    void theDeprecatedFilterIsEchoedAndNarrowsTheWindow() throws Exception {
        ToolEntry departing = row("tool-1", OWNER, "a.tool");
        when(service.catalog(null, null, true, null, null, 20, 0)).thenReturn(List.of(departing));
        when(service.countOf(null, null, true, null)).thenReturn(1L);
        when(service.schemaOf(departing)).thenReturn(emptyObject());

        ResponseEntity<ToolDtos.ToolList> answer = controller().list(null, null, true, null, null, null, null);

        ToolDtos.ToolList body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.deprecated()).isTrue();
        assertThat(body.tools()).hasSize(1);
        assertThat(body.total()).isEqualTo(1L);
        // The declaration's fields are unchanged: the filter decides WHICH rows, never what a row says.
        assertThat(mapper.valueToTree(body.tools().get(0)).size()).isEqualTo(7);
    }

    @Test
    void theLiveFilterIsEchoedAsFalseRatherThanAsAbsent() throws Exception {
        when(service.catalog(null, null, false, null, null, 20, 0)).thenReturn(List.of());
        when(service.countOf(null, null, false, null)).thenReturn(0L);

        ToolDtos.ToolList body = controller().list(null, null, false, null, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.deprecated()).isFalse();
        assertThat(body.total()).isZero();
    }

    @Test
    void anAbsentDeprecatedFilterIsEchoedAsNullAndKeepsTheNineFieldEnvelope() {
        when(service.catalog(null, null, null, null, null, 20, 0)).thenReturn(List.of());
        when(service.countOf(null, null, null, null)).thenReturn(0L);

        ToolDtos.ToolList body = controller().list(null, null, null, null, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.deprecated()).isNull();
        assertThat(body.tested()).isNull();
        assertThat(body.after()).isNull();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(9);
    }

    // ── v613: a keyset page names where it starts, and the total stays the whole set ────────────────
    @Test
    void theKeysetCursorIsEchoedAndDoesNotNarrowTheTotal() throws Exception {
        ToolEntry later = row("tool-3", OWNER, "z.tool");
        when(service.catalog(null, null, null, null, " m.tool ", 20, 0)).thenReturn(List.of(later));
        when(service.countOf(null, null, null, null)).thenReturn(4L);
        when(service.schemaOf(later)).thenReturn(emptyObject());

        ToolDtos.ToolList body = controller().list(null, null, null, null, " m.tool ", null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.after()).as("the cursor is echoed trimmed").isEqualTo("m.tool");
        assertThat(body.total()).as("a cursor is a position, not a filter").isEqualTo(4L);
        assertThat(body.tools()).extracting(ToolDtos.Tool::name).containsExactly("z.tool");
    }

    @Test
    void aCursorThatIsNotANameIsRefusedBeforeTheServiceIsAsked() {
        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().list(null, null, null, null, "M.TOOL", null, null));

        assertThat(refused).isInstanceOf(InvalidTool.class);
        assertThat(refused.getMessage()).contains("not a tool name");
        verifyNoInteractions(service);
    }

    // ── v590: the declaration at one pin ─────────────────────────────────────────────────────────────
    @Test
    void readingAtAPinAnswersTheRevisionAndWhetherItIsStillCurrent() throws Exception {
        ToolEntry current = row("tool-1", OWNER, "a.tool");
        when(service.atPin("tool-1", PIN)).thenReturn(new ToolRevision("tool-1", 1, "old sentence", "{}", AT));
        when(service.get("tool-1")).thenReturn(current);
        when(service.contractSha256(any(ToolRevision.class))).thenReturn(PIN);
        when(service.contractSha256(current)).thenReturn(PIN);
        when(service.schemaOf(any(ToolRevision.class))).thenReturn(emptyObject());

        ToolDtos.RevisionAtPin body = controller().atPin("tool-1", PIN).getBody();

        assertThat(body).isNotNull();
        assertThat(body.revision()).isEqualTo(1);
        assertThat(body.current()).isTrue();
        assertThat(body.contractSha256()).isEqualTo(PIN);
        // Seven fields: the revision's own five plus the id it belongs to and the derived currency flag.
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void aPinThatNamesNoRecordedRevisionIs404UnderItsOwnName() {
        ResponseEntity<Map<String, String>> answer =
                controller().unknownPin(new UnknownPin("tool \"tool-1\" has no revision carrying the pin \"x\""));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pin");
    }
    // ── v589: the tested filter names a claim, never a verdict ───────────────────────────────────────
    @Test
    void theTestedFilterIsEchoedAndNarrowsTheWindow() throws Exception {
        ToolEntry claimed = row("tool-1", OWNER, "a.tool");
        when(service.catalog(null, null, null, true, null, 20, 0)).thenReturn(List.of(claimed));
        when(service.countOf(null, null, null, true)).thenReturn(1L);
        when(service.schemaOf(claimed)).thenReturn(emptyObject());

        ToolDtos.ToolList body = controller().list(null, null, null, true, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.tested()).isTrue();
        assertThat(body.deprecated()).isNull();
        assertThat(body.total()).isEqualTo(1L);
        // Same seven declaration fields: the claim is a filter, never a column on the row.
        assertThat(mapper.valueToTree(body.tools().get(0)).size()).isEqualTo(7);
        assertThat(mapper.valueToTree(body).size()).isEqualTo(9);
    }

    @Test
    void anUntestedFilterIsEchoedAsFalseRatherThanAsAbsent() {
        when(service.catalog(null, null, null, false, null, 20, 0)).thenReturn(List.of());
        when(service.countOf(null, null, null, false)).thenReturn(0L);

        ToolDtos.ToolList body = controller().list(null, null, null, false, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.tested()).isFalse();
        assertThat(body.total()).isZero();
    }

    @Test
    void oneTestedAndOneLiveAreBothEchoedInTheSameAnswer() throws Exception {
        ToolEntry liveAndClaimed = row("tool-1", OWNER, "a.tool");
        when(service.catalog(null, null, false, true, null, 20, 0)).thenReturn(List.of(liveAndClaimed));
        when(service.countOf(null, null, false, true)).thenReturn(1L);
        when(service.schemaOf(liveAndClaimed)).thenReturn(emptyObject());

        ToolDtos.ToolList body = controller().list(null, null, false, true, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.deprecated()).isFalse();
        assertThat(body.tested()).isTrue();
        assertThat(body.total()).isEqualTo(1L);
    }

    // ── v583: the journal door ────────────────────────────────────────────────────────────────────────
    @Test
    void theJournalEchoesTheCursorItStartedAfter() {
        when(service.journal(null, null, 7L, 20, 0))
                .thenReturn(List.of(new ToolChange(8L, "tool-1", "a.tool", "updated", 2, AT)));
        when(service.journalCount(null, null, 7L)).thenReturn(1L);

        ToolDtos.ToolChangeList body = controller().changes(null, null, 7L, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.since()).isEqualTo(7L);
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.changes()).hasSize(1);
        assertThat(body.changes().get(0).name()).isEqualTo("a.tool");
        assertThat(body.changes().get(0).kind()).isEqualTo("updated");
        assertThat(body.changes().get(0).revision()).isEqualTo(2);
    }

    @Test
    void anAbsentCursorIsZeroRatherThanNull() {
        when(service.journal(null, null, 0L, 20, 0)).thenReturn(List.of());
        when(service.journalCount(null, null, 0L)).thenReturn(0L);

        ToolDtos.ToolChangeList body = controller().changes(null, null, null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.since()).isZero();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(7);
    }

    @Test
    void theJournalReportsTheCapAndFloorItApplied() {
        when(service.journal(null, null, 0L, 500, 0)).thenReturn(List.of());
        when(service.journalCount(null, null, 0L)).thenReturn(0L);

        ToolDtos.ToolChangeList body = controller().changes(null, null, null, 500, -3).getBody();

        assertThat(body).isNotNull();
        assertThat(body.limit()).isEqualTo(ToolService.MAX_LIST_LIMIT);
        assertThat(body.offset()).isZero();
    }

    @Test
    void aJournalEntryThatChangedNoContractCarriesNoRevision() throws Exception {
        ToolEntry gone = new ToolEntry("tool-1", OWNER, "a.tool", "a tool", "{}", AT);
        when(service.journal(null, null, 0L, 20, 0))
                .thenReturn(List.of(new ToolChange(9L, "tool-1", "a.tool", "removed", null, AT)));

        ToolDtos.ToolChangeView entry = controller().changes(null, null, null, null, null).getBody().changes().get(0);

        assertThat(entry.kind()).isEqualTo("removed");
        assertThat(entry.revision()).isNull();
        // A removal's entry still names the tool: the row it describes is gone.
        assertThat(entry.name()).isEqualTo("a.tool");
        assertThat(mapper.valueToTree(entry).get("revision").isNull()).isTrue();
    }

    // ── v584: the journal's two narrowings ──────────────────────────────────────────────────────────
    @Test
    void theJournalEchoesTheKindAndDeclarationItWasNarrowedTo() {
        when(service.journal("removed", "tool-1", 0L, 20, 0))
                .thenReturn(List.of(new ToolChange(9L, "tool-1", "a.tool", "removed", null, AT)));
        when(service.journalCount("removed", "tool-1", 0L)).thenReturn(1L);

        ToolDtos.ToolChangeList body = controller().changes(" removed ", " tool-1 ", null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.kind()).isEqualTo("removed");
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.total()).isEqualTo(1L);
        assertThat(body.changes()).hasSize(1);
    }

    @Test
    void anAbsentKindAndDeclarationAreEchoedAsNull() throws Exception {
        when(service.journal(null, null, 0L, 20, 0)).thenReturn(List.of());
        when(service.journalCount(null, null, 0L)).thenReturn(0L);

        ToolDtos.ToolChangeList body = controller().changes("", "  ", null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.kind()).isNull();
        assertThat(body.toolId()).isNull();
        assertThat(mapper.valueToTree(body).get("kind").isNull()).isTrue();
        assertThat(mapper.valueToTree(body).get("toolId").isNull()).isTrue();
    }

    @Test
    void anUnknownJournalKindIsRefusedBeforeTheServiceIsTouched() {
        assertThatThrownBy(() -> controller().changes("pruned", null, null, null, null))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("declared, updated, transferred, deprecated, undeprecated, attested, unattested, removed");
        verifyNoInteractions(service);
    }

    @Test
    void aToolIdThatHoldsNoEntryIsAnEmptyFeedRatherThanA404() {
        when(service.journal(null, "tool-that-never-existed", 0L, 20, 0)).thenReturn(List.of());
        when(service.journalCount(null, "tool-that-never-existed", 0L)).thenReturn(0L);

        ToolDtos.ToolChangeList body =
                controller().changes(null, "tool-that-never-existed", null, null, null).getBody();

        assertThat(body).isNotNull();
        assertThat(body.changes()).isEmpty();
        assertThat(body.total()).isZero();
        assertThat(body.toolId()).isEqualTo("tool-that-never-existed");
    }

    // ── v587: the batch door ───────────────────────────────────────────────────────────────────────
    @Test
    void aBatchAnswersInRequestOrderAndNamesWhatIsMissing() {
        when(service.batch(List.of("b", "a", "gone")))
                .thenReturn(List.of(row("b", OWNER, "b.tool"), row("a", OWNER, "a.tool")));

        ToolDtos.ToolBatch body =
                controller().batch(List.of(" b ", "a", "gone", "b", "  ")).getBody();

        assertThat(body).isNotNull();
        assertThat(body.requested()).isEqualTo(3);
        assertThat(body.found()).isEqualTo(2);
        assertThat(body.tools()).extracting(ToolDtos.Tool::name).containsExactly("b.tool", "a.tool");
        assertThat(body.missing()).containsExactly("gone");
        assertThat(mapper.valueToTree(body).size()).isEqualTo(4);
    }

    @Test
    void everyRowInABatchIsTheSameSevenFieldDeclaration() {
        when(service.batch(List.of("a"))).thenReturn(List.of(row("a", OWNER, "a.tool")));
        when(service.contractSha256(any(ToolEntry.class))).thenReturn("0".repeat(64));

        ToolDtos.ToolBatch body = controller().batch(List.of("a")).getBody();

        assertThat(body).isNotNull();
        assertThat(mapper.valueToTree(body.tools().get(0)).size()).isEqualTo(7);
        assertThat(body.tools().get(0).contractSha256()).hasSize(64);
    }

    @Test
    void aBatchWithNoIdIsRefusedBeforeTheServiceIsTouched() {
        assertThatThrownBy(() -> controller().batch(List.of(" ", "")))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at least one id");
        verifyNoInteractions(service);
    }

    @Test
    void aBatchOverTheBoundIsRefusedBeforeTheServiceIsTouched() {
        List<String> tooMany = java.util.stream.IntStream.range(0, ToolService.MAX_BATCH_IDS + 1)
                .mapToObj(i -> "tool-" + i)
                .toList();

        assertThatThrownBy(() -> controller().batch(tooMany))
                .isInstanceOf(InvalidTool.class)
                .hasMessageContaining("at most " + ToolService.MAX_BATCH_IDS);
        verifyNoInteractions(service);
    }

    // ── v588: the attestation doors ────────────────────────────────────────────────────────────────
    @Test
    void anAttestationEchoesItsPinAndSaysWhetherItIsStillCurrent() {
        String pin = "a".repeat(64);
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        ToolAttestation claim = new ToolAttestation("tool-1", pin, "ran it", AT);
        when(service.attest("tool-1", OWNER, pin, "ran it")).thenReturn(claim);
        when(service.get("tool-1")).thenReturn(row);
        when(service.contractSha256(row)).thenReturn(pin);

        ToolDtos.Attestation body =
                controller().attest("tool-1", OWNER, new ToolDtos.AttestRequest(pin, "ran it")).getBody();

        assertThat(body).isNotNull();
        assertThat(body.contractSha256()).isEqualTo(pin);
        assertThat(body.note()).isEqualTo("ran it");
        assertThat(body.attestedAt()).isEqualTo(AT.toEpochMilli());
        assertThat(body.stillCurrent()).isTrue();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(5);
    }

    @Test
    void anAttestationStaysOnRecordWhenTheContractMovesAndSaysItIsNoLongerCurrent() {
        String tested = "b".repeat(64);
        String served = "c".repeat(64);
        ToolEntry row = row("tool-1", OWNER, "a.tool");
        when(service.attestationOf("tool-1"))
                .thenReturn(new ToolAttestation("tool-1", tested, null, AT));
        when(service.get("tool-1")).thenReturn(row);
        when(service.contractSha256(row)).thenReturn(served);

        ToolDtos.Attestation body = controller().attestation("tool-1").getBody();

        assertThat(body).isNotNull();
        assertThat(body.contractSha256()).as("the claim still names the bytes it tested").isEqualTo(tested);
        assertThat(body.stillCurrent()).as("the pinned bytes are not what is served now").isFalse();
        assertThat(mapper.valueToTree(body).get("note").isNull()).isTrue();
    }

    @Test
    void aStaleClaimIsA409NamingTheServedPin() {
        ResponseEntity<Map<String, String>> answer =
                controller().stale(new StaleContract("tool \"t\" now serves \"c\""));

        assertThat(answer.getStatusCode().value()).isEqualTo(409);
        assertThat(answer.getBody()).containsEntry("error", "stale-contract");
        assertThat(answer.getBody().get("message")).contains("now serves");
    }

    @Test
    void aToolNobodyAttestedIsA404NotAttested() {
        ResponseEntity<Map<String, String>> answer =
                controller().notAttested(new UnknownAttestation("tool \"t\" has no attestation"));

        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "not-attested");
    }

    @Test
    void aWithdrawalEchoesWhatItDid() throws Exception {
        when(service.withdrawAttestation("tool-1", OWNER)).thenReturn(true);

        ToolDtos.WithdrawAttestationAnswer body =
                controller().withdrawAttestation("tool-1", OWNER).getBody();

        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.removed()).isTrue();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(2);
    }

    // ── v614: a diff says WHERE the two contracts differ, and both pins are echoed ──────────────────
    private static final String OTHER_PIN = "b".repeat(64);

    private static ContractComparison comparisonOf(boolean identical, boolean summaryChanged,
            ContractComparison.SchemaDiff schema) {
        return new ContractComparison("tool-1",
                new ContractComparison.Side(1, "a tool", PIN, AT.toEpochMilli()),
                new ContractComparison.Side(2, "a better tool", OTHER_PIN, AT.toEpochMilli()),
                identical, summaryChanged, schema);
    }

    @Test
    void theDiffEchoesBothSidesAndTheSchemaPaths() {
        when(service.diff("tool-1", PIN, OTHER_PIN)).thenReturn(comparisonOf(false, true,
                new ContractComparison.SchemaDiff(
                        List.of("/properties/city", "/required/1"),
                        List.of("/properties/note"),
                        List.of())));

        ToolDtos.ContractDiff body = controller().diff("tool-1", PIN, OTHER_PIN).getBody();

        assertThat(body).isNotNull();
        assertThat(body.toolId()).isEqualTo("tool-1");
        assertThat(body.from().revision()).isEqualTo(1);
        assertThat(body.from().summary()).isEqualTo("a tool");
        assertThat(body.to().revision()).isEqualTo(2);
        assertThat(body.to().contractSha256()).isEqualTo(OTHER_PIN);
        assertThat(body.identical()).isFalse();
        assertThat(body.summaryChanged()).isTrue();
        assertThat(body.schema().added()).containsExactly("/properties/city", "/required/1");
        assertThat(body.schema().removed()).containsExactly("/properties/note");
        assertThat(body.schema().changed()).isEmpty();
        // Six top-level fields, four in a side, three in the path answer: an added field is a capability
        // the door would start printing, so the shapes are pinned rather than assumed.
        assertThat(mapper.valueToTree(body).size()).isEqualTo(6);
        assertThat(mapper.valueToTree(body).get("from").size()).isEqualTo(4);
        assertThat(mapper.valueToTree(body).get("schema").size()).isEqualTo(3);
    }

    @Test
    void aDiffOfOnePinSaysIdenticalWithThreeEmptyLists() {
        when(service.diff("tool-1", PIN, PIN)).thenReturn(comparisonOf(true, false,
                new ContractComparison.SchemaDiff(List.of(), List.of(), List.of())));

        ToolDtos.ContractDiff body = controller().diff("tool-1", PIN, PIN).getBody();

        assertThat(body).isNotNull();
        assertThat(body.identical()).isTrue();
        assertThat(body.summaryChanged()).isFalse();
        assertThat(body.schema().added()).isEmpty();
        assertThat(body.schema().removed()).isEmpty();
        assertThat(body.schema().changed()).isEmpty();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(6);
    }

    @Test
    void anAbsentToPinIsPassedThroughAsAbsentRatherThanInvented() {
        when(service.diff("tool-1", PIN, null)).thenReturn(comparisonOf(false, false,
                new ContractComparison.SchemaDiff(List.of(), List.of(), List.of())));

        controller().diff("tool-1", PIN, null);

        verify(service).diff("tool-1", PIN, null);
    }

    @Test
    void aPinRefusalFromTheDiffKeepsItsOwnName() {
        when(service.diff("tool-1", PIN, null))
                .thenThrow(new UnknownPin("tool \"tool-1\" has no revision carrying the from pin"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(
                () -> controller().diff("tool-1", PIN, null));

        assertThat(refused).isInstanceOf(UnknownPin.class);
        ResponseEntity<Map<String, String>> answer = controller().unknownPin((UnknownPin) refused);
        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pin");
    }

    // ── v615: the global pin lookup is a LIST, because a pin names content ───────────────────────────
    @Test
    void theGlobalPinLookupMapsEveryMatchFieldForField() {
        PinLookup lookup = new PinLookup(PIN, List.of(
                new PinLookup.Match("tool-1", "a.tool", OWNER, 2, "shared sentence", PIN, AT.toEpochMilli(), true),
                new PinLookup.Match("tool-2", "b.tool", "acct-b", 1, "shared sentence", PIN, AT.toEpochMilli(), false)));
        when(service.byPin(PIN)).thenReturn(lookup);

        ToolDtos.PinMatches body = controller().byPin(PIN).getBody();

        assertThat(body).isNotNull();
        assertThat(body.pin()).isEqualTo(PIN);
        assertThat(body.total()).isEqualTo(2);
        assertThat(body.tools()).extracting(ToolDtos.PinMatch::name).containsExactly("a.tool", "b.tool");
        assertThat(body.tools().get(0).toolId()).isEqualTo("tool-1");
        assertThat(body.tools().get(0).revision()).isEqualTo(2);
        assertThat(body.tools().get(0).current()).isTrue();
        assertThat(body.tools().get(1).current()).isFalse();
        // Three top-level fields, eight in a match: a field added here is a capability the door starts
        // printing, so both shapes are pinned rather than assumed.
        assertThat(mapper.valueToTree(body).size()).isEqualTo(3);
        assertThat(mapper.valueToTree(body).get("tools").get(0).size()).isEqualTo(8);
    }

    @Test
    void aGlobalPinNobodyRecordedKeepsItsOwnName() {
        when(service.byPin(PIN)).thenThrow(new UnknownPin("no declaration has ever recorded the contract pin"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(() -> controller().byPin(PIN));

        assertThat(refused).isInstanceOf(UnknownPin.class);
        ResponseEntity<Map<String, String>> answer = controller().unknownPin((UnknownPin) refused);
        assertThat(answer.getStatusCode().value()).isEqualTo(404);
        assertThat(answer.getBody()).containsEntry("error", "unknown-pin");
    }

    // ── v616: a manifest of pins is ONE read, and an unrecorded pin is NAMED not thrown ─────────────
    @Test
    void aManifestEchoesWhatWasAskedAndWhatWasMissing() {
        when(service.byPins(List.of(PIN, OTHER_PIN))).thenReturn(new PinBatchLookup(2, 1,
                List.of(new PinLookup.Match("tool-1", "a.tool", OWNER, 1, "shared sentence", PIN,
                        AT.toEpochMilli(), true)),
                List.of(OTHER_PIN)));

        ToolDtos.PinBatch body = controller().pins(List.of(PIN, OTHER_PIN)).getBody();

        assertThat(body).isNotNull();
        assertThat(body.requested()).isEqualTo(2);
        assertThat(body.found()).isEqualTo(1);
        assertThat(body.missing()).containsExactly(OTHER_PIN);
        assertThat(body.tools()).extracting(ToolDtos.PinMatch::name).containsExactly("a.tool");
        assertThat(body.tools().get(0).contractSha256()).isEqualTo(PIN);
        assertThat(body.tools().get(0).current()).isTrue();
        assertThat(mapper.valueToTree(body).size()).isEqualTo(4);
        assertThat(mapper.valueToTree(body).get("tools").get(0).size()).isEqualTo(8);
    }

    @Test
    void anAbsentManifestIsPassedThroughAsAbsent() {
        when(service.byPins(null)).thenReturn(new PinBatchLookup(0, 0, List.of(), List.of()));

        controller().pins(null);

        verify(service).byPins(null);
    }

    @Test
    void aManifestRefusalKeepsItsOwnName() {
        when(service.byPins(null)).thenThrow(new InvalidTool("a batch pin read names at least one pin"));

        Throwable refused = org.assertj.core.api.Assertions.catchThrowable(() -> controller().pins(null));

        assertThat(refused).isInstanceOf(InvalidTool.class);
        ResponseEntity<Map<String, String>> answer = controller().invalid((InvalidTool) refused);
        assertThat(answer.getStatusCode().value()).isEqualTo(400);
        assertThat(answer.getBody()).containsEntry("error", "invalid-tool");
    }
}
