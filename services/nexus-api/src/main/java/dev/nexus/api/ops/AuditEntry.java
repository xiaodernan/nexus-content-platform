package dev.nexus.api.ops;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * v271 — one thing that HAPPENED to a publication.
 *
 * <p>The publication row says what IS; this row says what WAS DONE. They are different facts and they
 * change for different reasons: a publication is REPLACED on every re-publish, so it cannot hold a history,
 * while an audit entry is APPENDED and never replaced. That is why this is a second table and not a column.
 *
 * <p>It is an audit trail, not an identity system. The actor is recorded exactly as the service received it:
 * an account id, a handle and an assurance when a claim came with the request, and NOTHING when it did not. An
 * anonymous publish is an event with no actor, and pretending otherwise would be the one thing an audit trail
 * must never do. The service verifies none of it (ADR 0018) — the {@code assurance} column is the record's own
 * statement of what the claim was worth.
 *
 * <p>The target is the project id, because a project id is the only thing the service can name across every
 * verb: a publication, a take-down and a remix all address the same row.
 */
@Entity
@Table(name = "audit_entry")
public class AuditEntry {

    /** The entry's own id. Generated here: an audit entry is the service's record, not the caller's. */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** What happened: {@code publish} or {@code unpublish}. */
    @Column(name = "action", nullable = false, length = 40)
    private String action;

    /**
     * The account that did it, or NULL when nobody was named.
     *
     * <p>Nullable, and that is the point: an anonymous publish is a real event with no actor, and an audit
     * trail that could not say "nobody" would have to invent one.
     */
    @Column(name = "actor_account_id", length = 200)
    private String actorAccountId;

    /** The handle the claim carried, or null when no claim came with the request. */
    @Column(name = "actor_handle", length = 100)
    private String actorHandle;

    /** The assurance the claim carried, or null. {@code unsigned-local} is the only value this build accepts. */
    @Column(name = "actor_assurance", length = 40)
    private String actorAssurance;

    /** The project the event happened to. */
    @Column(name = "target_id", nullable = false, length = 200)
    private String targetId;

    /** When it happened. */
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected AuditEntry() {
        // for JPA
    }

    public AuditEntry(String action, String actorAccountId, String actorHandle, String actorAssurance, String targetId, Instant occurredAt) {
        this.action = action;
        this.actorAccountId = actorAccountId;
        this.actorHandle = actorHandle;
        this.actorAssurance = actorAssurance;
        this.targetId = targetId;
        this.occurredAt = occurredAt;
    }

    public Long getId() {
        return id;
    }

    public String getAction() {
        return action;
    }

    public String getActorAccountId() {
        return actorAccountId;
    }

    public String getActorHandle() {
        return actorHandle;
    }

    public String getActorAssurance() {
        return actorAssurance;
    }

    public String getTargetId() {
        return targetId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
