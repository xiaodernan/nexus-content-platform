package dev.nexus.api.mcp;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * M10 — the MCP face's wire shapes, and nothing about execution.
 *
 * <p>M10 names four things: API, MCP, tool registry, webhooks. The webhooks half is a row this service ACTS
 * on and the registry is a declaration it stores; this face is how those declarations are ADVERTISED to an
 * agent speaking MCP. Every shape below is a JSON-RPC 2.0 envelope or an MCP result, and the only capability
 * advertised is {@code tools.listChanged=false}: there is no {@code resources}, no {@code prompts}, no
 * {@code sampling}, and no execution.
 */
public final class McpDtos {

    /** JSON-RPC's own version. It is not the MCP protocol version below. */
    public static final String JSONRPC_VERSION = "2.0";

    /**
     * The MCP protocol revision this build speaks. A client that asks for another version still receives this
     * one, and the answer is the negotiation: the server names what it can serve rather than echoing a claim
     * about a protocol it does not implement.
     */
    public static final String PROTOCOL_VERSION = "2025-06-18";

    private McpDtos() {
    }

    /**
     * One JSON-RPC answer. Exactly one of {@code result} and {@code error} is present; {@code id} is echoed
     * from the request and is JSON null when the request had none (never omitted: JSON-RPC requires the member).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record JsonRpcResponse(String jsonrpc, JsonNode id, Object result, JsonRpcError error) {

        public static JsonRpcResponse result(JsonNode id, Object result) {
            return new JsonRpcResponse(JSONRPC_VERSION, id, result, null);
        }

        public static JsonRpcResponse failure(JsonNode id, int code, String message) {
            return new JsonRpcResponse(JSONRPC_VERSION, id, null, new JsonRpcError(code, message));
        }
    }

    /** One JSON-RPC error: a numeric code and a sentence a client can show a human. */
    public record JsonRpcError(int code, String message) {
    }

    /** The answer to {@code initialize}: the protocol this build speaks, and the one capability it has. */
    public record InitializeResult(
            String protocolVersion,
            Capabilities capabilities,
            ServerInfo serverInfo,
            String instructions) {
    }

    /** The advertised capabilities. Only {@code tools} is present, and its list is static. */
    public record Capabilities(ToolsCapability tools) {
    }

    /**
     * {@code listChanged} is FALSE because changing the registry does not announce itself: there is no
     * subscription, no notification and no socket this build keeps open. A client that needs a fresh list
     * asks again.
     */
    public record ToolsCapability(boolean listChanged) {
    }

    /** Who is answering. A static name and this build's version; no instance id, no environment. */
    public record ServerInfo(String name, String version) {
    }

    /**
     * One advertised tool: the name a caller uses, the declaration's sentence, and the schema it accepts.
     * There is deliberately no {@code url}, {@code command} or {@code invocation} field — the registry is a
     * declaration, and advertising it must not invent a capability.
     */
    public record ToolDescriptor(String name, String description, JsonNode inputSchema) {
    }

    /**
     * The {@code tools/list} window and the cursor that reaches the next one. {@code nextCursor} is omitted
     * when this page is the last, which is how MCP says "no more".
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ToolsListResult(List<ToolDescriptor> tools, String nextCursor) {
    }

    /** The {@code ping} result: an empty object, which is the whole of what MCP asks a ping to prove. */
    public record EmptyResult() {
    }
}
