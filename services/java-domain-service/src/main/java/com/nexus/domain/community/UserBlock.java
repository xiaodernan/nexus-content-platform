package com.nexus.domain.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

/**
 * One row of {@code user_blocks}: blocker → blocked, with a kind. READ ONLY here, and that is a boundary
 * rather than an omission: creating a block on the web side also tears down both follow edges and suppresses
 * notifications. A second writer that only inserted the row would leave a follow edge pointing at a blocked
 * person, which is the hole the web side deliberately closes. So this service asks what the relation is and
 * never changes it.
 */
@Entity
@Table(name = "user_blocks")
@IdClass(UserBlock.Key.class)
@Immutable
public class UserBlock {

    @Id
    @Column(name = "blocker_id")
    private UUID blockerId;

    @Id
    @Column(name = "blocked_id")
    private UUID blockedId;

    @Column(name = "kind")
    private String kind;

    public UUID getBlockerId() { return blockerId; }
    public UUID getBlockedId() { return blockedId; }
    public String getKind() { return kind; }

    /** Composite primary key (blocker_id, blocked_id): one row per ordered pair, kind is the last choice. */
    public static class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private UUID blockerId;
        private UUID blockedId;

        public Key() { }

        public Key(UUID blockerId, UUID blockedId) {
            this.blockerId = blockerId;
            this.blockedId = blockedId;
        }

        public UUID getBlockerId() { return blockerId; }
        public UUID getBlockedId() { return blockedId; }

        @Override
        public boolean equals(Object other) {
            if (this == other) { return true; }
            if (!(other instanceof Key key)) { return false; }
            return Objects.equals(blockerId, key.blockerId) && Objects.equals(blockedId, key.blockedId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(blockerId, blockedId);
        }
    }
}