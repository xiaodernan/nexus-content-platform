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
 * One row of {@code follows}: follower → followee. Read-only mapping for the same reason as {@link Like}:
 * the write is a native {@code ON CONFLICT DO NOTHING}, and the table belongs to the web layer's schema.
 *
 * <p>Direction matters. {@code setBlock} on the web side deletes BOTH directions when a block lands, so a
 * surviving edge is never a blocked pair — this service refuses to create one in the first place.
 */
@Entity
@Table(name = "follows")
@IdClass(Follow.Key.class)
@Immutable
public class Follow {

    @Id
    @Column(name = "follower_id")
    private UUID followerId;

    @Id
    @Column(name = "followee_id")
    private UUID followeeId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    public UUID getFollowerId() { return followerId; }
    public UUID getFolloweeId() { return followeeId; }
    public Instant getCreatedAt() { return createdAt; }

    /** Composite primary key (follower_id, followee_id). Named Key so it cannot shadow {@code @Id}. */
    public static class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private UUID followerId;
        private UUID followeeId;

        public Key() { }

        public Key(UUID followerId, UUID followeeId) {
            this.followerId = followerId;
            this.followeeId = followeeId;
        }

        public UUID getFollowerId() { return followerId; }
        public UUID getFolloweeId() { return followeeId; }

        @Override
        public boolean equals(Object other) {
            if (this == other) { return true; }
            if (!(other instanceof Key key)) { return false; }
            return Objects.equals(followerId, key.followerId) && Objects.equals(followeeId, key.followeeId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(followerId, followeeId);
        }
    }
}