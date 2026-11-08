package com.nexus.domain.project;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Project entity - maps to the 'projects' table in PostgreSQL.
 */
@Entity
@Table(name = "projects")
public class Project {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "slug", nullable = false)
    private String slug;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "kind", nullable = false)
    private String kind = "website";

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "visibility", nullable = false)
    private String visibility = "private";

    @Column(name = "fork_of")
    private UUID forkOf;

    @Column(name = "active_page_id")
    private String activePageId;

    @Column(name = "current_snapshot_id")
    private UUID currentSnapshotId;

    @Column(name = "brand_kit", columnDefinition = "jsonb")
    private String brandKit;

    @Column(name = "visual_dna", columnDefinition = "jsonb")
    private String visualDna;

    @Column(name = "active_mode")
    private String activeMode;

    @Column(name = "modes", columnDefinition = "jsonb")
    private String modes;

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

    public UUID getOwnerId() { return ownerId; }
    public void setOwnerId(UUID ownerId) { this.ownerId = ownerId; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }

    public UUID getForkOf() { return forkOf; }
    public void setForkOf(UUID forkOf) { this.forkOf = forkOf; }

    public String getActivePageId() { return activePageId; }
    public void setActivePageId(String activePageId) { this.activePageId = activePageId; }

    public UUID getCurrentSnapshotId() { return currentSnapshotId; }
    public void setCurrentSnapshotId(UUID currentSnapshotId) { this.currentSnapshotId = currentSnapshotId; }

    public String getBrandKit() { return brandKit; }
    public void setBrandKit(String brandKit) { this.brandKit = brandKit; }

    public String getVisualDna() { return visualDna; }
    public void setVisualDna(String visualDna) { this.visualDna = visualDna; }

    public String getActiveMode() { return activeMode; }
    public void setActiveMode(String activeMode) { this.activeMode = activeMode; }

    public String getModes() { return modes; }
    public void setModes(String modes) { this.modes = modes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }
}
