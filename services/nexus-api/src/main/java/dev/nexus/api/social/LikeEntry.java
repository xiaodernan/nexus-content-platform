package dev.nexus.api.social;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * M7 v283 — ONE like: an account saying "this publication is worth something".
 *
 * <p>A like is a ROW and not a counter, and the difference matters. A counter on the publication row
 * would answer "how many" and nothing else: it could not say WHO liked, WHEN, or whether the same person
 * liked twice. A row answers all three, and it is the row that makes the second rule enforceable — the
 * UNIQUE constraint on (publication, account) is what makes "the same account cannot like the same
 * publication twice" a fact the DATABASE enforces rather than a fact the service hopes for.
 *
 * <p>Why a like needs an account at all: an anonymous like cannot be DE-DUPLICATED. Two anonymous likes
 * from one device and two anonymous likes from two devices are the same row as far as the service can
 * tell, so an anonymous like would make the count a number nobody could defend. The service therefore
 * REFUSES a like with no account, by name, rather than counting something it cannot count honestly.
 *
 * <p>The account is a CLAIM. This service records claims and verifies nothing (ADR 0018): the assurance
 * travels with the row so a reader is told what the like is worth instead of inferring it, and nothing
 * here makes it worth more than that.
 */
@Entity
@Table(
        name = "like_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "like_entry_target_account",
                columnNames = {"target_project_id", "actor_account_id"}))
public class LikeEntry {

    /** The like's own row id. The pair (publication, account) is what identifies a like; this is the key. */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The publication that was liked. NOT verified against the publication table: the service records
     *  claims, and a like of something that was taken down is still a like that happened. */
    @Column(name = "target_project_id", nullable = false, length = 200)
    private String targetProjectId;

    /** The account that liked. The claim's account id — never blank, or the row would be un-deduplicable. */
    @Column(name = "actor_account_id", nullable = false, length = 200)
    private String actorAccountId;

    /** The handle the claim carried, when it carried one. A name beside the id, for a reader. */
    @Column(name = "actor_handle", length = 24)
    private String actorHandle;

    /** What the claim was worth when it arrived. `unsigned-local` in this build. */
    @Column(name = "actor_assurance", length = 32)
    private String actorAssurance;

    /** When the like happened — the service's own instant, not the client's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected LikeEntry() {
        // JPA needs it; the service never builds one without values.
    }

    public LikeEntry(
            String targetProjectId,
            String actorAccountId,
            String actorHandle,
            String actorAssurance,
            Instant createdAt) {
        this.targetProjectId = targetProjectId;
        this.actorAccountId = actorAccountId;
        this.actorHandle = actorHandle;
        this.actorAssurance = actorAssurance;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getTargetProjectId() {
        return targetProjectId;
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

    public Instant getCreatedAt() {
        return createdAt;
    }
}
