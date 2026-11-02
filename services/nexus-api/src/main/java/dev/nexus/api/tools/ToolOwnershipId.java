package dev.nexus.api.tools;

import java.io.Serializable;
import java.util.Objects;

/**
 * M10 v579 - the composite key of one handover: which declaration, and which transfer of it.
 *
 * <p>A transfer number is scoped to ONE tool id, exactly as a revision number is. Two declarations both start
 * at 1, because a handover is a position in one tool's own chain of holders, not a registry-wide sequence.
 */
public class ToolOwnershipId implements Serializable {

    private String toolId;
    private int transfer;

    protected ToolOwnershipId() {
        // JPA needs it.
    }

    public ToolOwnershipId(String toolId, int transfer) {
        this.toolId = toolId;
        this.transfer = transfer;
    }

    public String getToolId() {
        return toolId;
    }

    public int getTransfer() {
        return transfer;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof ToolOwnershipId that)) {
            return false;
        }
        return transfer == that.transfer && Objects.equals(toolId, that.toolId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(toolId, transfer);
    }
}