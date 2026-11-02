package dev.nexus.api.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import dev.nexus.api.tools.ToolEntry;
import dev.nexus.api.tools.ToolService;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * M10 — the MCP face's protocol logic: advertise the registry, refuse every call.
 *
 * <p>This is the piece ADR 0022 named as missing when it said the registry "does not advertise them over
 * MCP". The advertisement is read-only: {@code tools/list} reads the SAME declarations {@code /tools} serves,
 * in the same name order, through the same service method — there is no second catalog to drift.
 *
 * <p>{@code tools/call} is NOT implemented, and not by omission: it is refused with {@code -32601} and a
 * sentence that says why. A face that silently omitted the method would look like a bug to a client; a face
 * that answered it would be executing what ADR 0022 says this build never executes. The refusal is the
 * honest third option.
 *
 * <p>No state lives here. There is no session, no cursor table and no {@code mcp} table; a restart changes
 * nothing about the face, which is why the live proof can restart the JVM and ask the same questions.
 */
@Service
public class McpService {

    /** The page size of {@code tools/list}. The registry's own cap, reused rather than invented. */
    public static final int PAGE_SIZE = ToolService.MAX_LIST_LIMIT;

    private final ToolService tools;

    public McpService(ToolService tools) {
        this.tools = tools;
    }

    /**
     * Answer one JSON-RPC method, or refuse it by name.
     *
     * @throws McpRefusal when the method is not offered or its params are not the ones it takes
     */
    public Object call(String method, JsonNode params) {
        return switch (method) {
            case "initialize" -> initialize();
            case "ping" -> new McpDtos.EmptyResult();
            case "tools/list" -> listTools(params);
            case "tools/call" -> throw McpRefusal.methodNotFound(
                    "tools/call is not offered by this server: the registry DECLARES tools and this build"
                            + " does not execute them — there is no URL, command or handler to call");
            default -> throw McpRefusal.methodNotFound(
                    "method \"" + method + "\" is not offered by this server — it advertises tools/list only");
        };
    }

    /**
     * Accept one notification. A notification carries no id and therefore no answer; this face has no state
     * a notification could change, so the only thing to validate is that it IS a notification.
     *
     * @throws McpRefusal when a request with no id names an ordinary method, which cannot be answered
     */
    public void notify(String method) {
        if (!method.startsWith("notifications/")) {
            throw McpRefusal.invalidRequest(
                    "a request without an id must be a notification (notifications/...), not \"" + method + "\"");
        }
    }

    private McpDtos.InitializeResult initialize() {
        return new McpDtos.InitializeResult(
                McpDtos.PROTOCOL_VERSION,
                new McpDtos.Capabilities(new McpDtos.ToolsCapability(false)),
                new McpDtos.ServerInfo("nexus-api", "0.1.0"),
                "This server advertises the tool registry's declarations. It does not execute tools: tools/call"
                        + " is refused by name, and no declaration carries an endpoint, command or handler.");
    }

    /**
     * The declarations as MCP tool descriptors, name ascending, one page at a time. The cursor is the decimal
     * offset of the next page — opaque to clients and simple enough to be read in a log.
     *
     * <p>The window is the SAME call the catalog uses, so a tool's description and schema here are the bytes
     * a REST reader sees. A registry that changes between two pages can shift the cursor; the bound is stated
     * in the ADR rather than hidden behind a stability this build cannot promise.
     */
    private McpDtos.ToolsListResult listTools(JsonNode params) {
        int offset = 0;
        if (params != null && !params.isNull()) {
            if (!params.isObject()) {
                throw McpRefusal.invalidParams("tools/list params must be an OBJECT carrying an optional cursor");
            }
            JsonNode cursor = params.get("cursor");
            if (cursor != null && !cursor.isNull()) {
                if (!cursor.isTextual() || !cursor.asText().matches("[0-9]{1,9}")) {
                    throw McpRefusal.invalidParams(
                            "cursor must be the decimal offset this server handed out, got " + cursor);
                }
                offset = Integer.parseInt(cursor.asText());
            }
        }
        List<ToolEntry> rows = tools.catalog(null, PAGE_SIZE, offset);
        long total = tools.countOf(null);
        List<McpDtos.ToolDescriptor> descriptors = rows.stream()
                .map(row -> new McpDtos.ToolDescriptor(row.getName(), row.getSummary(), tools.schemaOf(row)))
                .toList();
        int reached = offset + rows.size();
        String next = reached < total ? Integer.toString(reached) : null;
        return new McpDtos.ToolsListResult(descriptors, next);
    }
}
