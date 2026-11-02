package dev.nexus.api.mcp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * M10 — the MCP face's ONE door: {@code POST /mcp}, JSON-RPC 2.0 over HTTP.
 *
 * <p>The MCP transport this build speaks is plain request/response HTTP: no SSE stream, no long-lived
 * session, no {@code GET /mcp}. A client posts one JSON-RPC request and reads one JSON-RPC answer, which is
 * enough for {@code initialize}, {@code ping}, {@code tools/list} and the notifications a client sends
 * between them.
 *
 * <p>Three rules shape the door:
 *
 * <ul>
 *   <li>A JSON-RPC error is HTTP 200. The request was understood and refused by the protocol, which is not
 *       an HTTP failure; only a body that is not JSON fails at HTTP (Spring's 400, before this class).</li>
 *   <li>A notification is HTTP 202 with no body. JSON-RPC forbids answering one, so the status says
 *       "accepted" and the empty body says "nothing to say".</li>
 *   <li>The id is echoed EXACTLY — string, number or null — and every error carries it, so a client can
 *       match an answer to the request that caused it.</li>
 * </ul>
 */
@RestController
public class McpController {

    private final McpService service;

    public McpController(McpService service) {
        this.service = service;
    }

    /** The id types JSON-RPC permits. Anything else is an invalid request, and the answer's id is null. */
    private static final Set<String> ID_TYPES = Set.of("string", "number", "null");

    @PostMapping(path = "/mcp", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> handle(@RequestBody JsonNode body) {
        JsonNode id = idOf(body);
        try {
            if (!body.isObject()) {
                throw McpRefusal.invalidRequest(
                        "a JSON-RPC request must be an OBJECT — this build does not accept batches");
            }
            if (!McpDtos.JSONRPC_VERSION.equals(body.path("jsonrpc").asText(null))) {
                throw McpRefusal.invalidRequest(
                        "jsonrpc must be \"" + McpDtos.JSONRPC_VERSION + "\"");
            }
            String method = body.path("method").asText(null);
            if (method == null || method.isBlank()) {
                throw McpRefusal.invalidRequest("a JSON-RPC request must name a method");
            }
            JsonNode rawId = body.get("id");
            if (rawId != null && !rawId.isNull() && !ID_TYPES.contains(rawId.getNodeType().name().toLowerCase())) {
                throw McpRefusal.invalidRequest(
                        "id must be a STRING, a NUMBER or null, got " + rawId.getNodeType());
            }
            if (rawId == null) {
                service.notify(method);
                return ResponseEntity.status(202).build();
            }
            return ResponseEntity.ok(McpDtos.JsonRpcResponse.result(id, service.call(method, body.get("params"))));
        } catch (McpRefusal e) {
            return ResponseEntity.ok(McpDtos.JsonRpcResponse.failure(id, e.code(), e.getMessage()));
        }
    }

    /**
     * The id to echo: the request's own when it is a legal JSON-RPC id, and JSON null otherwise. An error
     * about an illegal id must still carry a legal one, and null is the protocol's answer for "unknown".
     */
    private static JsonNode idOf(JsonNode body) {
        JsonNode id = body.isObject() ? body.get("id") : null;
        if (id == null || id.isNull() || id.isTextual() || id.isNumber()) {
            return id == null ? NullNode.getInstance() : id;
        }
        return NullNode.getInstance();
    }
}
