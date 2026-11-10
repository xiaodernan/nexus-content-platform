package com.nexus.domain.permission;

import com.nexus.domain.community.PublicationRepository;
import com.nexus.domain.project.Project;
import com.nexus.domain.project.ProjectRepository;
import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Permission checks, read-only (SC-18). The question answered is "may this user act on this resource?", read
 * off the same rows the web layer wrote: the user's role, projects.owner_id, and the publication → project
 * chain. The service writes nothing.
 *
 * <p>What is deliberately NOT here:
 * <ul>
 *   <li>grantRole / revokeRole — the in-flight draft let any caller rewrite users.role with no supervision
 *       and no audit trail. A role write is a privilege-escalation primitive; roles change in the web layer,
 *       which owns the users table.</li>
 *   <li>toUserDetails — the draft declared a UserDetails return type and returned an Authentication; it never
 *       compiled. Authentication is the gateway's job (SC-13 AuthFilter); this service only judges roles.</li>
 *   <li>isModerator — users.role carries exactly two labels (creator, admin); a moderator identity the schema
 *       cannot store would be invented authority.</li>
 *   <li>Visibility rules — whether a stranger may read a given project or publication is enforced by the web
 *       layer's own query paths. Here a non-owner gets read and nothing else, mirroring the legacy contract;
 *       a resource that does not resolve grants nothing at all.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class PermissionService {

    private final UserRepository users;
    private final ProjectRepository projects;
    private final PublicationRepository publications;

    public PermissionService(UserRepository users, ProjectRepository projects,
            PublicationRepository publications) {
        this.users = users;
        this.projects = projects;
        this.publications = publications;
    }

    /**
     * Ownership grants every action; a non-owner gets read only; a resource that does not resolve grants
     * nothing — the caller answers 404 for a missing row, and a ghost must not become a silent yes.
     */
    public boolean hasPermission(UUID userId, String resourceType, String resourceId, String action) {
        User user = users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        if (user.getRole() == User.UserRole.ADMIN) {
            return true;
        }
        Optional<Project> resource = switch (resourceType) {
            case "project" -> projects.findById(UUID.fromString(resourceId));
            case "publication" -> publications.findById(UUID.fromString(resourceId))
                    .flatMap(publication -> projects.findById(publication.getProjectId()));
            default -> throw new IllegalArgumentException("Unknown resource type: " + resourceType);
        };
        if (resource.isEmpty()) {
            return false;
        }
        return userId.equals(resource.get().getOwnerId()) || "read".equals(action);
    }

    public boolean isAdmin(UUID userId) {
        return User.UserRole.ADMIN == roleOf(userId);
    }

    public String getUserAuthority(UUID userId) {
        return "ROLE_" + roleOf(userId).name().toLowerCase(Locale.ROOT);
    }

    private User.UserRole roleOf(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId))
                .getRole();
    }
}
