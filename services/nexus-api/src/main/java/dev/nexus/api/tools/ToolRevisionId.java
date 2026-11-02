package dev.nexus.api.tools;

import java.io.Serializable;
import java.util.Objects;

/**
 * M10 v573 - the composite key of one recorded revision: which declaration, and which revision of it.
 *
 * <p>A revision number is scoped to ONE tool id. Two declarations both start at 1, because a revision is a
 * position in one contract's own history, not a registry-wide sequence.
 */
public class ToolRevisionId implements Serializable {

    private String toolId;
    private int revision;

    protected ToolRevisionId() {
        // JPA needs it.
    }

    public ToolRevisionId(String toolId, int revision) {
        this.toolId = toolId;
        this.revision = revision;
    }

    public String getToolId() {
        return toolId;
    }

    public int getRevision() {
        return revision;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof ToolRevisionId that)) {
            return false;
        }
        return revision == that.revision && Objects.equals(toolId, that.toolId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(toolId, revision);
    }
}
