package dev.nexus.api.tools;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * M10 v583 - ONE entry in the registry's journal: a write that HAPPENED, in the order it was accepted.
 *
 * <p>This table duplicates no STATE: revisions, ownership rows and deprecation rows say what is true now, and a
 * reader gets the current contract from the declaration. A journal answers a different question - what has
 * happened since I last looked - and it cannot be derived from the state tables for two reasons that are worth
 * naming: a REMOVAL deletes every row that could have said it happened, and an UNDEPRECATION deletes the row that
 * said the tool was going away. A feed derived from state would therefore be a feed that silently omits exactly
 * the changes an agent most needs to hear. It is the same distinction the audit trail draws between "a row
 * exists" and "a thing happened".
 *
 * <p>{@code seq} is a database identity column: monotonically increasing at ALLOCATION. Two concurrent
 * transactions can be assigned 41 and 42 and commit in the other order, so a reader that has seen 41 may see 42
 * before 41 exists. That bound is stated in ADR 0034 rather than papered over. It is not a problem for the
 * intended use - a poller re-asks with the last seq it PROCESSED and tolerates a re-read - and writes to the SAME
 * declaration are serialized by the row lock every writing door takes, so one tool's entries are always in order.
 *
 * <p>{@code name} is copied in, which no state table would need: a removed tool has no row left to read a name
 * from, and "declaration X was removed" is useless without one. {@code revision} is present only for changes that
 * wrote a contract (declared, updated) - it points at the revision a caller can then read for the pin and the
 * schema, so the journal says WHERE to look rather than duplicating what it said.
 */
@Entity
@Table(name = "tool_change", indexes = {
        @Index(name = "idx_tool_change_kind_seq", columnList = "kind, seq"),
        @Index(name = "idx_tool_change_tool_seq", columnList = "tool_id, seq")
})
public class ToolChange {

    /** The journal's own order. Assigned by the database at insert; never reused, never updated. */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "seq", nullable = false)
    private Long seq;

    /** The declaration this entry is about. Kept after the declaration itself is deleted - that is the point. */
    @Column(name = "tool_id", nullable = false, length = 64)
    private String toolId;

    /** The declaration's global name AT the time of the write, so a removal is still nameable. */
    @Column(name = "name", nullable = false, length = 64)
    private String name;

    /** What happened: declared, updated, transferred, deprecated, undeprecated or removed. */
    @Column(name = "kind", nullable = false, length = 16)
    private String kind;

    /** The revision this change produced, for changes that wrote a contract; null for the others. */
    @Column(name = "revision")
    private Integer revision;

    /** This service's clock at the write; never the caller's. */
    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    protected ToolChange() {
        // JPA needs it.
    }

    /**
     * An entry that already carries its journal position — for a row read back from the table, and for a test
     * that needs a seq without a database. The journal never sets this itself: the database assigns it.
     */
    public ToolChange(Long seq, String toolId, String name, String kind, Integer revision, Instant changedAt) {
        this(toolId, name, kind, revision, changedAt);
        this.seq = seq;
    }

    public ToolChange(String toolId, String name, String kind, Integer revision, Instant changedAt) {
        this.toolId = toolId;
        this.name = name;
        this.kind = kind;
        this.revision = revision;
        this.changedAt = changedAt;
    }

    public Long getSeq() {
        return seq;
    }

    public String getToolId() {
        return toolId;
    }

    public String getName() {
        return name;
    }

    public String getKind() {
        return kind;
    }

    public Integer getRevision() {
        return revision;
    }

    public Instant getChangedAt() {
        return changedAt;
    }
}