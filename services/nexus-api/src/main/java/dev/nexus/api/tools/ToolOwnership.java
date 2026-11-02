package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v579 - ONE accepted handover of a declaration: who held it, who holds it now, and when this service
 * recorded the change.
 *
 * <p>Ownership is a fact ABOUT a declaration, not a field of its contract, so it gets its own append-only
 * chain rather than a revision row. A revision answers "what did this declaration say"; a handover says nothing
 * about what it says - the summary and the schema are untouched, and a consumer's pin still matches afterwards.
 * Recording a handover as a revision would make a revision number stop meaning "the contract changed", which
 * is the one thing the number is for.
 *
 * <p>Nothing updates a transfer row: {@link ToolEntry#getOwner()} is the CURRENT holder, and these rows are how
 * the registry can still answer who held it before. Without them a handover would be a silent flip of a column
 * - the same erasure the revision history exists to prevent.
 *
 * <p>The chain does NOT survive removal of its declaration, for the same reason the revisions do not: a removed
 * declaration has no current holder for a chain to explain.
 */
@Entity
@IdClass(ToolOwnershipId.class)
@Table(name = "tool_ownership")
public class ToolOwnership {

    /** The declaration that changed hands. */
    @Id
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** 1 for the first handover of THIS tool, then one more for every accepted transfer. */
    @Id
    @Column(name = "transfer", nullable = false)
    private int transfer;

    /** The account that held the declaration and gave it away. */
    @Column(name = "from_owner", nullable = false, length = 200)
    private String fromOwner;

    /** The account that holds it from this instant on. */
    @Column(name = "to_owner", nullable = false, length = 200)
    private String toOwner;

    /** This service's clock at the handover; never the caller's. */
    @Column(name = "transferred_at", nullable = false)
    private Instant transferredAt;

    protected ToolOwnership() {
        // JPA needs it.
    }

    public ToolOwnership(String toolId, int transfer, String fromOwner, String toOwner, Instant transferredAt) {
        this.toolId = toolId;
        this.transfer = transfer;
        this.fromOwner = fromOwner;
        this.toOwner = toOwner;
        this.transferredAt = transferredAt;
    }

    public String getToolId() {
        return toolId;
    }

    public int getTransfer() {
        return transfer;
    }

    public String getFromOwner() {
        return fromOwner;
    }

    public String getToOwner() {
        return toOwner;
    }

    public Instant getTransferredAt() {
        return transferredAt;
    }
}