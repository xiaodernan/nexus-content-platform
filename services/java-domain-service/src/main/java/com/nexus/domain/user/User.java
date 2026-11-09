package com.nexus.domain.user;

import com.fasterxml.jackson.annotation.JsonCreator;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * User entity - maps to the 'users' table in PostgreSQL.
 * Matches the Drizzle schema defined in apps/web/src/server/db/schema.ts
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "email")
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "handle")
    private String handle;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "bio", columnDefinition = "TEXT")
    private String bio;

    @Column(name = "role", nullable = false)
    @Convert(converter = UserRoleLabelConverter.class)
    private UserRole role = UserRole.CREATOR;

    @Column(name = "plan", nullable = false)
    @Convert(converter = UserPlanLabelConverter.class)
    private UserPlan plan = UserPlan.FREE;

    @Column(name = "guest", nullable = false)
    private Boolean guest = false;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getHandle() { return handle; }
    public void setHandle(String handle) { this.handle = handle; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public UserRole getRole() { return role; }
    public void setRole(UserRole role) { this.role = role; }

    public UserPlan getPlan() { return plan; }
    public void setPlan(UserPlan plan) { this.plan = plan; }

    public Boolean getGuest() { return guest; }
    public void setGuest(Boolean guest) { this.guest = guest; }

    public Instant getClaimedAt() { return claimedAt; }
    public void setClaimedAt(Instant claimedAt) { this.claimedAt = claimedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }

    /**
     * The role vocabulary, and the LABELS the database actually stores.
     *
     * <p>Measured against the real schema (2026-11-09): {@code users.role} is a PostgreSQL enum whose
     * labels are {@code 'creator'} and {@code 'admin'} — lowercase. Writing the Java constant names
     * instead fails outright:
     *
     * <pre>ERROR: invalid input value for enum user_role: "CREATOR"</pre>
     *
     * <p>That is not a hypothetical: this service's write path did exactly that, so every user it created
     * was rejected by the database. The label is therefore carried BY the constant, and the constant's
     * name is never the thing that reaches the column.
     *
     * <p>{@code MODERATOR} used to be a constant here. The schema has never had that label, so it was a
     * role this service could promise and never deliver; it is gone, and {@link #fromLabel(String)}
     * refuses it by name.
     */
    public enum UserRole {
        CREATOR("creator"),
        ADMIN("admin");

        private final String label;

        UserRole(String label) {
            this.label = label;
        }

        /** The label the database stores, and the label the rest of the platform speaks. */
        public String label() {
            return label;
        }

        /**
         * Read a role from the wire. Case-insensitive on the way in, because a caller writing
         * {@code "Creator"} and a caller writing {@code "creator"} mean the same role.
         *
         * <p>This is also the JSON factory, so a body that carries {@code "creator"} deserializes into
         * {@link #CREATOR} instead of failing: the platform's vocabulary is lowercase, and Jackson's
         * default enum reader would have demanded {@code "CREATOR"}.
         *
         * @throws IllegalArgumentException when the word names no role this service can store.
         */
        @JsonCreator
        public static UserRole fromLabel(String raw) {
            if (raw == null || raw.isBlank()) {
                throw new IllegalArgumentException("a role is required; the accepted roles are 'creator' and 'admin'");
            }
            for (UserRole role : values()) {
                if (role.label.equalsIgnoreCase(raw.trim()) || role.name().equalsIgnoreCase(raw.trim())) {
                    return role;
                }
            }
            throw new IllegalArgumentException(
                    "'" + raw + "' is not a role this service can store; the accepted roles are 'creator' and 'admin'");
        }
    }

    /**
     * The plan tiers, and the LABELS the database stores.
     *
     * <p>Measured against the real schema: {@code users.plan} is a plain {@code text} column whose
     * values the web layer writes and compares in LOWERCASE ({@code 'free'}, {@code 'pro'}, …) — see
     * {@code apps/web/src/server/db/schema.ts} and {@code apps/web/src/server/domain/roles.ts}. A row
     * written here as {@code "FREE"} would be a row no web-layer comparison ever matches, so the label is
     * carried by the constant here too.
     */
    public enum UserPlan {
        FREE("free"),
        PRO("pro"),
        CREATOR("creator"),
        STUDIO("studio"),
        ENTERPRISE("enterprise");

        private final String label;

        UserPlan(String label) {
            this.label = label;
        }

        /** The label the database stores, and the label the rest of the platform speaks. */
        public String label() {
            return label;
        }

        /**
         * Read a tier from the wire.
         *
         * <p>Also the JSON factory, for the same reason as {@link UserRole#fromLabel(String)}: the
         * platform sends {@code "free"}, and Jackson's default enum reader would have demanded
         * {@code "FREE"}.
         *
         * @throws IllegalArgumentException when the word names no tier this service can store.
         */
        @JsonCreator
        public static UserPlan fromLabel(String raw) {
            if (raw == null || raw.isBlank()) {
                throw new IllegalArgumentException("a plan is required; the accepted plans are 'free', 'pro', 'creator', 'studio' and 'enterprise'");
            }
            for (UserPlan plan : values()) {
                if (plan.label.equalsIgnoreCase(raw.trim()) || plan.name().equalsIgnoreCase(raw.trim())) {
                    return plan;
                }
            }
            throw new IllegalArgumentException(
                    "'" + raw + "' is not a plan this service can store; the accepted plans are 'free', 'pro', 'creator', 'studio' and 'enterprise'");
        }
    }
}
