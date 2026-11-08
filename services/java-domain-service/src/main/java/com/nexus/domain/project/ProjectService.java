package com.nexus.domain.project;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Project domain service - authoritative write path for project operations.
 */
@Service
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;

    public ProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    /**
     * Create a new project.
     */
    @Transactional
    public Project createProject(UUID ownerId, String slug, String name, String kind, String description) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setOwnerId(ownerId);
        project.setSlug(slug);
        project.setName(name);
        project.setKind(kind != null ? kind : "website");
        project.setDescription(description);
        project.setVisibility("private");

        return projectRepository.save(project);
    }

    /**
     * Update project metadata (name, description, visibility).
     */
    @Transactional
    public Project updateProject(UUID projectId, String name, String description, String visibility) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + projectId));

        if (name != null) {
            project.setName(name);
        }
        if (description != null) {
            project.setDescription(description);
        }
        if (visibility != null) {
            project.setVisibility(visibility);
        }

        return projectRepository.save(project);
    }

    /**
     * Soft delete a project.
     */
    @Transactional
    public void deleteProject(UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + projectId));

        project.setDeletedAt(Instant.now());
        projectRepository.save(project);
    }

    /**
     * Get project by ID (excludes soft-deleted).
     */
    public Optional<Project> getProjectById(UUID projectId) {
        return projectRepository.findById(projectId)
                .filter(p -> p.getDeletedAt() == null);
    }

    /**
     * Get project by owner and slug.
     */
    public Optional<Project> getProjectByOwnerAndSlug(UUID ownerId, String slug) {
        return projectRepository.findByOwnerIdAndSlugAndDeletedAtIsNull(ownerId, slug);
    }

    /**
     * List projects by owner.
     */
    public List<Project> getProjectsByOwner(UUID ownerId) {
        return projectRepository.findByOwnerIdAndDeletedAtIsNull(ownerId);
    }

    /**
     * List public/unlisted projects.
     */
    public List<Project> getPublicProjects() {
        return projectRepository.findByVisibilityAndDeletedAtIsNull("public");
    }

    /**
     * Fork a project (create a copy with forkOf reference).
     */
    @Transactional
    public Project forkProject(UUID originalProjectId, UUID newOwnerId, String newSlug, String newName) {
        Project original = projectRepository.findById(originalProjectId)
                .orElseThrow(() -> new IllegalArgumentException("Original project not found: " + originalProjectId));

        Project fork = new Project();
        fork.setId(UUID.randomUUID());
        fork.setOwnerId(newOwnerId);
        fork.setSlug(newSlug);
        fork.setName(newName);
        fork.setKind(original.getKind());
        fork.setDescription("Fork of: " + original.getName());
        fork.setVisibility("private");
        fork.setForkOf(originalProjectId);

        return projectRepository.save(fork);
    }

    /**
     * List forks of a project.
     */
    public List<Project> getProjectForks(UUID projectId) {
        return projectRepository.findByForkOfAndDeletedAtIsNull(projectId);
    }
}
