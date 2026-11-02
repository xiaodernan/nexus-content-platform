package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v573 - ONE recorded revision of a tool declaration: what the declaration SAID at an instant.
 *
 * <p>ADR 0023 replaced a declaration's summary and schema in place, which meant the values a consumer built
 * against disappeared with the next edit. This row is the same reasoning the audit trail uses: a row that is
 * REPLACED cannot hold a history. Each accepted write appends one revision; nothing updates a revision row.
 *
 * <p>The revision is a RECORDED WRITE, not a content diff. Two identical PUTs make two revisions because two
 * writes happened; deduplicating them would hide a successful write from the caller's own history.
 *
 * <p>The row does NOT survive removal of its declaration. A webhook receipt is evidence that a knock was
 * attempted after the subscription was gone; a revision is the declaration itself, and a removed declaration
 * has no current contract to explain.
 */
@Entity
@IdClass(ToolRevisionId.class)
@Table(name = "tool_revision")
public class ToolRevision {

    /** The declaration this revision belongs to. Not a foreign-key object: the registry needs no join. */
    @Id
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** 1 for the declaration as registered, then one more for every accepted update of THIS tool. */
    @Id
    @Column(name = "revision", nullable = false)
    private int revision;

    /** The sentence as it stood at this revision. */
    @Column(name = "summary", nullable = false, length = 280)
    private String summary;

    /** The canonical compact schema as it stood at this revision. */
    @Column(name = "input_schema", nullable = false, length = 8192)
    private String inputSchema;

    /** This service's clock at the write that recorded this revision; never the caller's. */
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected ToolRevision() {
        // JPA needs it.
    }

    public ToolRevision(String toolId, int revision, String summary, String inputSchema, Instant recordedAt) {
        this.toolId = toolId;
        this.revision = revision;
        this.summary = summary;
        this.inputSchema = inputSchema;
        this.recordedAt = recordedAt;
    }

    public String getToolId() {
        return toolId;
    }

    public int getRevision() {
        return revision;
    }

    public String getSummary() {
        return summary;
    }

    public String getInputSchema() {
        return inputSchema;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }
}
