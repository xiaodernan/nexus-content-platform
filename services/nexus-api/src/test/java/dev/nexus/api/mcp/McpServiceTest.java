package dev.nexus.api.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.nexus.api.tools.ToolEntry;
import dev.nexus.api.tools.ToolService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * M10 — the MCP face's protocol rules, graded without a database or a Spring context.
 *
 * <p>The load-bearing cases are the ones a client would notice: {@code tools/list} maps the SAME declarations
 * the registry stores (and advertises no field the registry does not have), the cursor reaches the second
 * page and then stops, and {@code tools/call} is refused before anything is read.
 */
@ExtendWith(MockitoExtension.class)
class McpServiceTest {

    private static final Instant AT = Instant.parse("2026-11-02T08:00:00Z");
    private static final String OWNER = "acct-ada";

    @Mock
    private ToolService tools;

    private final ObjectMapper mapper = new ObjectMapper();

    private McpService service() {
        return new McpService(tools);
    }

    private ToolEntry row(String id, String name, String summary) {
        return new ToolEntry(id, OWNER, name, summary, "{}", AT);
    }

    private JsonNode emptyObject() throws Exception {
        return mapper.readTree("{}");
    }

    @Test
    void initializeNamesTheProtocolTheOneCapabilityAndTheRefusalItCarries() throws Exception {
        McpDtos.InitializeResult result = (McpDtos.InitializeResult) service().call("initialize", null);

        assertThat(result.protocolVersion()).isEqualTo(McpDtos.PROTOCOL_VERSION);
        assertThat(result.capabilities().tools().listChanged()).isFalse();
        assertThat(result.serverInfo().name()).isEqualTo("nexus-api");
        assertThat(result.serverInfo().version()).isEqualTo("0.1.0");
        assertThat(result.instructions()).contains("does not execute tools", "tools/call");
        verifyNoInteractions(tools);
    }

    @Test
    void toolsListMapsTheDeclarationsAndAdvertisesNoCapabilityField() throws Exception {
        ToolEntry alpha = row("tool-a", "alpha.tool", "Reads the weather.");
        ToolEntry zulu = row("tool-z", "zulu.tool", "Writes nothing at all.");
        when(tools.catalog(null, McpService.PAGE_SIZE, 0)).thenReturn(List.of(alpha, zulu));
        when(tools.countOf(null)).thenReturn(2L);
        when(tools.schemaOf(alpha)).thenReturn(mapper.readTree("{\"type\":\"object\"}"));
        when(tools.schemaOf(zulu)).thenReturn(emptyObject());

        McpDtos.ToolsListResult result = (McpDtos.ToolsListResult) service().call("tools/list", null);

        assertThat(result.tools()).hasSize(2);
        assertThat(result.tools().get(0).name()).isEqualTo("alpha.tool");
        assertThat(result.tools().get(0).description()).isEqualTo("Reads the weather.");
        assertThat(result.tools().get(0).inputSchema().get("type").asText()).isEqualTo("object");
        assertThat(result.tools().get(1).name()).isEqualTo("zulu.tool");
        assertThat(result.nextCursor()).isNull();

        JsonNode wire = mapper.valueToTree(result);
        for (String forbidden : new String[] {"url", "endpoint", "command", "invocationCount", "execution"}) {
            assertThat(wire.get("tools").get(0).has(forbidden)).as("advertised field %s", forbidden).isFalse();
        }
        verify(tools).catalog(null, McpService.PAGE_SIZE, 0);
        verify(tools).countOf(null);
    }

    @Test
    void theCursorReachesTheSecondPageAndThenStops() throws Exception {
        List<ToolEntry> first = new ArrayList<>();
        for (int i = 0; i < McpService.PAGE_SIZE; i++) {
            first.add(row("tool-" + i, String.format("tool.%03d", i), "tool " + i));
        }
        ToolEntry last = row("tool-last", "zulu.tool", "the last one");
        when(tools.catalog(null, McpService.PAGE_SIZE, 0)).thenReturn(first);
        when(tools.catalog(null, McpService.PAGE_SIZE, McpService.PAGE_SIZE)).thenReturn(List.of(last));
        when(tools.countOf(null)).thenReturn(101L);
        when(tools.schemaOf(any(ToolEntry.class))).thenReturn(emptyObject());

        McpDtos.ToolsListResult pageOne = (McpDtos.ToolsListResult) service().call("tools/list", null);
        assertThat(pageOne.tools()).hasSize(McpService.PAGE_SIZE);
        assertThat(pageOne.nextCursor()).isEqualTo(Integer.toString(McpService.PAGE_SIZE));

        JsonNode cursor = mapper.readTree("{\"cursor\":\"" + pageOne.nextCursor() + "\"}");
        McpDtos.ToolsListResult pageTwo = (McpDtos.ToolsListResult) service().call("tools/list", cursor);
        assertThat(pageTwo.tools()).hasSize(1);
        assertThat(pageTwo.tools().get(0).name()).isEqualTo("zulu.tool");
        assertThat(pageTwo.nextCursor()).isNull();
    }

    @Test
    void aCursorThatIsNotAnOffsetIsInvalidParamsAndNothingIsRead() {
        for (String bad : new String[] {"abc", "-1", "1.5", "1000000000"}) {
            JsonNode cursor = mapper.createObjectNode().put("cursor", bad);
            McpRefusal refusal = catchThrowableOfType(
                    () -> service().call("tools/list", cursor), McpRefusal.class);
            assertThat(refusal.code()).isEqualTo(McpRefusal.INVALID_PARAMS);
            assertThat(refusal.getMessage()).contains("cursor");
        }
        verifyNoInteractions(tools);
    }

    @Test
    void paramsThatAreNotAnObjectAreInvalidParams() {
        McpRefusal refusal = catchThrowableOfType(
                () -> service().call("tools/list", mapper.createArrayNode()), McpRefusal.class);
        assertThat(refusal.code()).isEqualTo(McpRefusal.INVALID_PARAMS);
        assertThat(refusal.getMessage()).contains("OBJECT");
        verifyNoInteractions(tools);
    }

    @Test
    void toolsCallIsRefusedByNameAndTouchesNothing() {
        McpRefusal refusal = catchThrowableOfType(
                () -> service().call("tools/call", mapper.createObjectNode().put("name", "alpha.tool")),
                McpRefusal.class);

        assertThat(refusal.code()).isEqualTo(McpRefusal.METHOD_NOT_FOUND);
        assertThat(refusal.getMessage()).contains("tools/call", "DECLARES", "does not execute");
        verifyNoInteractions(tools);
    }

    @Test
    void anUnknownMethodIsMethodNotFoundAndNamesItself() {
        McpRefusal refusal = catchThrowableOfType(
                () -> service().call("resources/list", null), McpRefusal.class);
        assertThat(refusal.code()).isEqualTo(McpRefusal.METHOD_NOT_FOUND);
        assertThat(refusal.getMessage()).contains("resources/list", "tools/list only");
        verifyNoInteractions(tools);
    }

    @Test
    void pingAnswersAnEmptyResultWithoutTouchingTheRegistry() {
        Object result = service().call("ping", null);
        assertThat(result).isInstanceOf(McpDtos.EmptyResult.class);
        assertThat(mapper.valueToTree(result).isEmpty()).isTrue();
        verifyNoInteractions(tools);
    }

    @Test
    void aNotificationIsAcceptedOnlyWhenItIsOne() {
        service().notify("notifications/initialized");
        service().notify("notifications/cancelled");

        McpRefusal refusal = catchThrowableOfType(
                () -> service().notify("tools/list"), McpRefusal.class);
        assertThat(refusal.code()).isEqualTo(McpRefusal.INVALID_REQUEST);
        assertThat(refusal.getMessage()).contains("notification");
        verifyNoInteractions(tools);
    }

    @Test
    void aCursorIsReadOnlyWhenItNamesAPageThatExists() throws Exception {
        when(tools.catalog(null, McpService.PAGE_SIZE, 7)).thenReturn(List.of());
        when(tools.countOf(null)).thenReturn(0L);

        McpDtos.ToolsListResult result = (McpDtos.ToolsListResult) service()
                .call("tools/list", mapper.readTree("{\"cursor\":\"7\"}"));

        assertThat(result.tools()).isEmpty();
        assertThat(result.nextCursor()).isNull();
    }

    @Test
    void aListWithNothingToShowIsAnEmptyWindowAndNoCursor() throws Exception {
        when(tools.catalog(null, McpService.PAGE_SIZE, 0)).thenReturn(List.of());
        when(tools.countOf(null)).thenReturn(0L);

        McpDtos.ToolsListResult result = (McpDtos.ToolsListResult) service().call("tools/list", null);

        assertThat(result.tools()).isEmpty();
        assertThat(result.nextCursor()).isNull();
        verify(tools, never()).schemaOf(any(ToolEntry.class));
    }
}
