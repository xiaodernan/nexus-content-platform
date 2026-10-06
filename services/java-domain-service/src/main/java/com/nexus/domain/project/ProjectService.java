package com.nexus.domain.project;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Project domain service - authoritative write path for project operations.
 * This service manages project lifecycle, metadata, and ownership.
 */
@Service
@Transactional(readOnly = true)
public class ProjectService {

    // TODO: Inject ProjectRepository and implement project operations
    // - createProject
    // - updateProject
    // - deleteProject (soft delete)
    // - getProjectById
    // - listUserProjects

}
