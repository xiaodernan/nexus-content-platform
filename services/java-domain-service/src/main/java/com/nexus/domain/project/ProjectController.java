package com.nexus.domain.project;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Project REST API - exposes project domain service operations.
 */
@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    /**
     * Get project by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ProjectResponse> getProject(@PathVariable UUID id) {
        return projectService.getProjectById(id)
                .map(project -> ResponseEntity.ok(toResponse(project)))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Create a new project.
     */
    @PostMapping
    public ResponseEntity<ProjectResponse> createProject(@RequestBody CreateProjectRequest request) {
        Project project = projectService.createProject(
                request.getOwnerId(),
                request.getSlug(),
                request.getName(),
                request.getKind(),
                request.getDescription()
        );
        return ResponseEntity.status(201).body(toResponse(project));
    }

    /**
     * Update project metadata.
     */
    @PatchMapping("/{id}")
    public ResponseEntity<ProjectResponse> updateProject(
            @PathVariable UUID id,
            @RequestBody UpdateProjectRequest request) {
        Project project = projectService.updateProject(
                id,
                request.getName(),
                request.getDescription(),
                request.getVisibility()
        );
        return ResponseEntity.ok(toResponse(project));
    }

    /**
     * Soft delete project.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProject(@PathVariable UUID id) {
        projectService.deleteProject(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * List projects by owner.
     */
    @GetMapping("/by-owner/{ownerId}")
    public ResponseEntity<List<ProjectResponse>> getProjectsByOwner(@PathVariable UUID ownerId) {
        List<Project> projects = projectService.getProjectsByOwner(ownerId);
        return ResponseEntity.ok(projects.stream().map(this::toResponse).toList());
    }

    /**
     * Fork a project.
     */
    @PostMapping("/{id}/fork")
    public ResponseEntity<ProjectResponse> forkProject(
            @PathVariable UUID id,
            @RequestBody ForkProjectRequest request) {
        Project fork = projectService.forkProject(
                id,
                request.getNewOwnerId(),
                request.getNewSlug(),
                request.getNewName()
        );
        return ResponseEntity.status(201).body(toResponse(fork));
    }

    /**
     * List forks of a project.
     */
    @GetMapping("/{id}/forks")
    public ResponseEntity<List<ProjectResponse>> getProjectForks(@PathVariable UUID id) {
        List<Project> forks = projectService.getProjectForks(id);
        return ResponseEntity.ok(forks.stream().map(this::toResponse).toList());
    }

    // Request/Response DTOs
    public static class CreateProjectRequest {
        private UUID ownerId;
        private String slug;
        private String name;
        private String kind;
        private String description;

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
    }

    public static class UpdateProjectRequest {
        private String name;
        private String description;
        private String visibility;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getVisibility() { return visibility; }
        public void setVisibility(String visibility) { this.visibility = visibility; }
    }

    public static class ForkProjectRequest {
        private UUID newOwnerId;
        private String newSlug;
        private String newName;

        public UUID getNewOwnerId() { return newOwnerId; }
        public void setNewOwnerId(UUID newOwnerId) { this.newOwnerId = newOwnerId; }
        public String getNewSlug() { return newSlug; }
        public void setNewSlug(String newSlug) { this.newSlug = newSlug; }
        public String getNewName() { return newName; }
        public void setNewName(String newName) { this.newName = newName; }
    }

    public static class ProjectResponse {
        private UUID id;
        private UUID ownerId;
        private String slug;
        private String name;
        private String kind;
        private String description;
        private String visibility;
        private UUID forkOf;

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
    }

    private ProjectResponse toResponse(Project project) {
        ProjectResponse response = new ProjectResponse();
        response.setId(project.getId());
        response.setOwnerId(project.getOwnerId());
        response.setSlug(project.getSlug());
        response.setName(project.getName());
        response.setKind(project.getKind());
        response.setDescription(project.getDescription());
        response.setVisibility(project.getVisibility());
        response.setForkOf(project.getForkOf());
        return response;
    }
}
