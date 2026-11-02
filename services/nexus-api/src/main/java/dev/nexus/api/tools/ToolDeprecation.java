package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v575 - ONE declaration's deprecation: the sentence that says it is going away, and what replaces it.
 *
 * <p>Deprecation is not a field of the declaration. ADR 0022 pinned six declaration columns and ADR 0023 kept
 * the six-field read; "this tool is going away" is a separate fact with its own author, instant and message,
 * and it can be withdrawn without touching what the tool accepts. One row per tool: a deprecation is a
 * current state, not a history, and re-deprecating replaces the sentence and moves the instant.
 *
 * <p>{@code replacementName} is a HINT, not a foreign key. The successor may be declared after this row says
 * its name, and coupling the two would force an owner to publish the replacement first. The name is validated
 * as a legal tool name (so a typo cannot be stored as a plausible address) but no door checks that it holds a
 * row - a replacement that names nothing is a fact the reader can see for itself.
 */
@Entity
@Table(name = "tool_deprecation")
public class ToolDeprecation {

    /** The declaration being deprecated. One row per tool: this is the primary key, not a history. */
    @Id
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** The owner's sentence about why it is going away, trimmed and bounded. */
    @Column(name = "message", nullable = false, length = 280)
    private String message;

    /** The name of the tool that replaces it, or null when the owner names none. A hint, not a reference. */
    @Column(name = "replacement_name", length = 64)
    private String replacementName;

    /** This service's clock at the write that declared (or last re-declared) the deprecation. */
    @Column(name = "deprecated_at", nullable = false)
    private Instant deprecatedAt;

    protected ToolDeprecation() {
        // JPA needs it.
    }

    public ToolDeprecation(String toolId, String message, String replacementName, Instant deprecatedAt) {
        this.toolId = toolId;
        this.message = message;
        this.replacementName = replacementName;
        this.deprecatedAt = deprecatedAt;
    }

    public String getToolId() {
        return toolId;
    }

    public String getMessage() {
        return message;
    }

    public String getReplacementName() {
        return replacementName;
    }

    public Instant getDeprecatedAt() {
        return deprecatedAt;
    }

    /** Re-declaring a deprecation replaces its sentence, hint and instant; it never appends a second row. */
    public void replace(String message, String replacementName, Instant deprecatedAt) {
        this.message = message;
        this.replacementName = replacementName;
        this.deprecatedAt = deprecatedAt;
    }
}
