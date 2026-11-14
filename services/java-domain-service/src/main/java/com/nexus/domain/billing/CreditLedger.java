package com.nexus.domain.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

/**
 * One row of {@code credit_ledger} (§134) — an append-only FACT, never a balance.
 *
 * <p>The shape is the web schema's ({@code apps/web/src/server/db/schema.ts}, migration 0016), and two
 * of its rules are why this mapping is read-only:
 * <ul>
 *   <li><b>No balance column exists.</b> A person's balance is the sum of their {@code delta} for a kind;
 *       a stored balance would be a second, mutable copy of a number the ledger already answers.</li>
 *   <li><b>Append-only is enforced in the database</b> — a BEFORE UPDATE OR DELETE trigger refunds or
 *       corrects by writing a NEW row, never by editing one. Every consume row must trace to a task that
 *       really happened ({@code task_id}; the (task_id, kind) partial unique index makes the sync and
 *       async completion paths the same row, not two).</li>
 * </ul>
 *
 * <p>{@code @Immutable} keeps Hibernate from ever thinking it manages updates here; {@code created_at} is
 * {@code insertable = false, updatable = false} because the column has a database default and a second
 * clock is how two writers disagree about "when".
 */
@Entity
@Table(name = "credit_ledger")
@Immutable
public class CreditLedger {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** ai / image / video / compute / marketplace — the CHECK-guarded list (see BillingService.CREDIT_KINDS). */
    @Column(name = "kind", nullable = false)
    private String kind;

    /** Positive = granted, negative = consumed. Zero is refused by the database (CHECK, migration 0016). */
    @Column(name = "delta", nullable = false)
    private int delta;

    /** One human-readable sentence that names the event this row is the receipt of. */
    @Column(name = "reason", nullable = false)
    private String reason;

    /** plan_grant / generation / adjust / marketplace_purchase / marketplace_sale. */
    @Column(name = "source", nullable = false)
    private String source;

    /** The generation task a consume row is the receipt of; grant and adjust rows leave it null. */
    @Column(name = "task_id")
    private UUID taskId;

    @Column(name = "project_id")
    private UUID projectId;

    /** The month a plan grant was for ('2026-11'); the (user, kind, period) unique index makes re-grants idempotent. */
    @Column(name = "period")
    private String period;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getKind() { return kind; }
    public int getDelta() { return delta; }
    public String getReason() { return reason; }
    public String getSource() { return source; }
    public UUID getTaskId() { return taskId; }
    public UUID getProjectId() { return projectId; }
    public String getPeriod() { return period; }
    public Instant getCreatedAt() { return createdAt; }
}
