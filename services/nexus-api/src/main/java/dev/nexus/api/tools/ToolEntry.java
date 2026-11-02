package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * M10 v571 — ONE registered tool: a DECLARATION of something an external agent calls, and nothing more.
 *
 * <p>M10 names "API, MCP, tool registry, webhooks". The webhooks half is a row this service ACTS on; this
 * row is the opposite: it says what exists and what it accepts, and the service never executes it, never
 * calls a URL on its behalf and never stores that it ran. That is why the row has no endpoint, no command,
 * no owner-supplied handler and no invocation counter — a field for a capability this build does not have
 * would be a door a reader would assume was wired.
 *
 * <p>The NAME is globally unique, not per owner. A registry whose names were only owner-scoped would let two
 * accounts announce two different tools under one name, and a caller holding a name would have to guess which
 * one it meant. The unique constraint states that as the database's rule; the service also checks first so a
 * duplicate can be refused with the id of the row that already holds the name.
 *
 * <p>{@code inputSchema} is stored as canonical compact JSON (the service writes it that way), so two callers
 * who send the same object with different whitespace produce byte-identical rows.
 */
@Entity
@Table(
        name = "tool_entry",
        uniqueConstraints = @UniqueConstraint(name = "tool_entry_name", columnNames = {"name"}))
public class ToolEntry {

    /** The tool's own id — a row id, not the name. A name can be freed and taken again; an id cannot. */
    @Id
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** The account that declared this tool — host-declared, opaque, the same rule as every other account id. */
    @Column(name = "owner_account_id", nullable = false, length = 200)
    private String owner;

    /** The global name a caller uses to ask for this tool. Unique across the whole registry. */
    @Column(name = "name", nullable = false, length = 64)
    private String name;

    /** One sentence about what the tool does, bounded and required so a catalog entry is never a bare name. */
    @Column(name = "summary", nullable = false, length = 280)
    private String summary;

    /**
     * The JSON Schema this tool accepts, in canonical compact form, at most 8192 bytes. A declaration, not a
     * validator: nothing in this build checks a call against it, because nothing in this build makes calls.
     */
    @Column(name = "input_schema", nullable = false, length = 8192)
    private String inputSchema;

    /** When the declaration was made — this service's clock, never the caller's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ToolEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public ToolEntry(
            String toolId,
            String owner,
            String name,
            String summary,
            String inputSchema,
            Instant createdAt) {
        this.toolId = toolId;
        this.owner = owner;
        this.name = name;
        this.summary = summary;
        this.inputSchema = inputSchema;
        this.createdAt = createdAt;
    }

    public String getToolId() {
        return toolId;
    }

    public String getOwner() {
        return owner;
    }

    public String getName() {
        return name;
    }

    public String getSummary() {
        return summary;
    }

    /** The stored canonical JSON text. The controller parses it back for the wire shape. */
    public String getInputSchema() {
        return inputSchema;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /**
     * Replace the sentence. The name, owner, id and instant are NOT settable: a declaration's identity and
     * lookup key are not fields an update rewrites.
     */
    public void setSummary(String summary) {
        this.summary = summary;
    }

    /** Replace the stored canonical schema text. The caller must canonicalize and bound it first. */
    public void setInputSchema(String inputSchema) {
        this.inputSchema = inputSchema;
    }
}
