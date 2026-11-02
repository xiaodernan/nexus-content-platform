package dev.nexus.api.mcp;

/**
 * M10 — one JSON-RPC refusal, carrying the number the protocol assigns it.
 *
 * <p>A refusal is an ANSWER, not an HTTP failure: the request reached this server and was understood well
 * enough to be refused, so the envelope travels at HTTP 200 with an {@code error} member. The HTTP layer only
 * fails for a body that is not JSON at all, which Spring refuses before this class exists.
 */
public class McpRefusal extends RuntimeException {

    /** The request was JSON but not a JSON-RPC request: wrong version, no method, an id of the wrong type, a batch. */
    public static final int INVALID_REQUEST = -32600;

    /** The method is not offered. This is where {@code tools/call} lands, and it is the point of the face. */
    public static final int METHOD_NOT_FOUND = -32601;

    /** The method exists but its params do not: a cursor that is not an offset, params that are not an object. */
    public static final int INVALID_PARAMS = -32602;

    private final int code;

    public McpRefusal(int code, String message) {
        super(message);
        this.code = code;
    }

    public int code() {
        return code;
    }

    public static McpRefusal invalidRequest(String message) {
        return new McpRefusal(INVALID_REQUEST, message);
    }

    public static McpRefusal methodNotFound(String message) {
        return new McpRefusal(METHOD_NOT_FOUND, message);
    }

    public static McpRefusal invalidParams(String message) {
        return new McpRefusal(INVALID_PARAMS, message);
    }
}
