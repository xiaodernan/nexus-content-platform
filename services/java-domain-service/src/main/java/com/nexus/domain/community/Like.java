package com.nexus.domain.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

/**
 * One row of {@code likes}: a person liking a project. The table is owned by the web layer's schema
 * (apps/web/src/server/db/schema.ts); this mapping only reads it.
 *
 * <p>{@code @Immutable} is deliberate. The write is a native {@code INSERT … ON CONFLICT DO NOTHING}
 * (see {@link LikeRepository}) because that is what makes a double-click idempotent, and JPA has no portable
 * way to say it. Marking the mapping read-only keeps Hibernate from thinking it manages these rows.
 *
 * <p>Note the key: likes hang off the PROJECT, not the publication — the same choice the web layer made, so
 * a new published version of the same work does not reset its like count.
 *
 * <p>The composite key class is named {@code Key}, not {@code Id}: a nested type called {@code Id} shadows
 * the {@code jakarta.persistence.Id} import inside the entity, and the compiler then reads every {@code @Id}
 * as an attempt to use the key class as an annotation.
 */
@Entity
@Table(name = "likes")
@IdClass(Like.Key.class)
@Immutable
public class Like {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public UUID getUserId() { return userId; }
    public UUID getProjectId() { return projectId; }
    public Instant getCreatedAt() { return createdAt; }

    /** Composite primary key (user_id, project_id) — the constraint the ON CONFLICT arm leans on. */
    public static class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private UUID userId;
        private UUID projectId;

        public Key() { }

        public Key(UUID userId, UUID projectId) {
            this.userId = userId;
            this.projectId = projectId;
        }

        public UUID getUserId() { return userId; }
        public UUID getProjectId() { return projectId; }

        @Override
        public boolean equals(Object other) {
            if (this == other) { return true; }
            if (!(other instanceof Key key)) { return false; }
            return Objects.equals(userId, key.userId) && Objects.equals(projectId, key.projectId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, projectId);
        }
    }
}