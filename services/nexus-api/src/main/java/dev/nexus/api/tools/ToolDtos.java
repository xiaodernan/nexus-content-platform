package dev.nexus.api.tools;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * M10 v571 — the wire shapes for the tool registry.
 *
 * <p>The schema travels as a JSON OBJECT, not as a string that contains JSON. A string field would make every
 * client double-encode its schema and would let a caller send {@code "{}"} where an object was meant; an
 * object field can be validated by shape before it is stored, which is what {@link ToolService} does.
 */
public final class ToolDtos {

    private ToolDtos() {
    }

    /** The body a caller sends to declare a tool. The service refuses every field by name. */
    public record RegisterRequest(String owner, String name, String summary, JsonNode inputSchema) {
    }

    /**
     * The body a caller sends to REPLACE a declaration's summary and schema.
     *
     * <p>There is no {@code name}, {@code owner} or {@code id} here: the name is the registry's global lookup
     * key and the owner and id identify the row, so an update changes only what a declaration SAYS, never
     * which declaration it is.
     */
    public record UpdateRequest(String summary, JsonNode inputSchema) {
    }

    /**
     * One tool as every read door answers it.
     *
     * <p>There is no {@code url}, {@code command}, {@code invocationCount} or {@code lastCalledAt} field: this
     * build declares tools and does not run them, and an answer that carried such a field would describe a
     * capability nobody implemented.
     */
    public record Tool(
            String id, String owner, String name, String summary, JsonNode inputSchema, long createdAt) {
    }

    /**
     * The catalog window, and the WHOLE (narrowed) count beside it.
     *
     * <p>{@code owner} is the filter the answer applied, or null when the answer is the whole catalog. It is
     * echoed so a caller reading twenty rows can tell which catalog those twenty came from.
     */
    public record ToolList(String owner, List<Tool> tools, long total, int limit, int offset) {
    }
}
