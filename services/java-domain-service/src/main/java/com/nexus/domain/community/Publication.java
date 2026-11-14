package com.nexus.domain.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

/**
 * The published version an interaction lands on. Read-only: publishing, moderation and snapshots all belong
 * to the web layer. Only the four columns the reachability predicate needs are mapped — mapping the whole
 * table here would invite this service to start writing it.
 *
 * <p>{@code visibility} and {@code moderation} are native PostgreSQL enums in the shared schema. They are
 * read as String (the pool sets {@code stringtype=unspecified}); this service never binds them into a write.
 */
@Entity
@Table(name = "published_projects")
@Immutable
public class Publication {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "visibility")
    private String visibility;

    @Column(name = "moderation")
    private String moderation;

    public UUID getId() { return id; }
    public UUID getProjectId() { return projectId; }
    public String getVisibility() { return visibility; }
    public String getModeration() { return moderation; }
}