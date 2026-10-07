package com.nexus.domain.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Project repository - JPA data access layer for project operations.
 */
@Repository
public interface ProjectRepository extends JpaRepository<Project, UUID> {

    /**
     * Find projects by owner ID (excludes soft-deleted).
     */
    List<Project> findByOwnerIdAndDeletedAtIsNull(UUID ownerId);

    /**
     * Find project by owner and slug (unique constraint).
     */
    Optional<Project> findByOwnerIdAndSlugAndDeletedAtIsNull(UUID ownerId, String slug);

    /**
     * Find projects by visibility (excludes soft-deleted).
     */
    List<Project> findByVisibilityAndDeletedAtIsNull(String visibility);

    /**
     * Find forked projects from a parent project.
     */
    List<Project> findByForkOfAndDeletedAtIsNull(UUID forkOf);
}
