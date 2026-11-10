package com.nexus.domain.permission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.nexus.domain.community.Publication;
import com.nexus.domain.community.PublicationRepository;
import com.nexus.domain.project.Project;
import com.nexus.domain.project.ProjectRepository;
import com.nexus.domain.user.User;
import com.nexus.domain.user.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The permission reader, graded without a Spring context. The legs that matter: ownership is read off the
 * owner column, publication ownership is traced through its project, a ghost resource grants nothing (the
 * caller should 404, not 403), and a missing user is a refusal rather than a silent false.
 */
@ExtendWith(MockitoExtension.class)
class PermissionServiceTest {

    private static final UUID USER = UUID.fromString("dddddddd-0000-0000-0000-000000000001");
    private static final UUID STRANGER = UUID.fromString("dddddddd-0000-0000-0000-000000000002");
    private static final UUID PROJECT = UUID.fromString("dddddddd-0000-0000-0000-000000000003");
    private static final UUID PUBLICATION = UUID.fromString("dddddddd-0000-0000-0000-000000000004");

    @Mock private UserRepository users;
    @Mock private ProjectRepository projects;
    @Mock private PublicationRepository publications;

    private User userWithRole(User.UserRole role) {
        User user = new User();
        user.setId(USER);
        user.setRole(role);
        return user;
    }

    private Project projectOwnedBy(UUID ownerId) {
        Project project = new Project();
        project.setId(PROJECT);
        project.setOwnerId(ownerId);
        return project;
    }

    @Test
    void adminAnswersYesWithoutConsultingTheResource() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.ADMIN)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "project", PROJECT.toString(), "delete")).isTrue();
        verifyNoInteractions(projects, publications);
    }

    @Test
    void aCreatorAnswersYesOnTheirOwnProject_evenForADestructiveAction() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        when(projects.findById(PROJECT)).thenReturn(Optional.of(projectOwnedBy(USER)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "project", PROJECT.toString(), "delete")).isTrue();
    }

    @Test
    void aCreatorGetsOnlyReadOnSomeoneElsesProject() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        when(projects.findById(PROJECT)).thenReturn(Optional.of(projectOwnedBy(STRANGER)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "project", PROJECT.toString(), "read")).isTrue();
        assertThat(service.hasPermission(USER, "project", PROJECT.toString(), "write")).isFalse();
    }

    @Test
    void publicationOwnershipIsTracedThroughItsProject() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        Publication publication = mock(Publication.class);
        when(publication.getProjectId()).thenReturn(PROJECT);
        when(publications.findById(PUBLICATION)).thenReturn(Optional.of(publication));
        when(projects.findById(PROJECT)).thenReturn(Optional.of(projectOwnedBy(USER)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "publication", PUBLICATION.toString(), "write")).isTrue();
    }

    @Test
    void aPublicationOwnedBySomeoneElseGrantsOnlyRead() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        Publication publication = mock(Publication.class);
        when(publication.getProjectId()).thenReturn(PROJECT);
        when(publications.findById(PUBLICATION)).thenReturn(Optional.of(publication));
        when(projects.findById(PROJECT)).thenReturn(Optional.of(projectOwnedBy(STRANGER)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "publication", PUBLICATION.toString(), "read")).isTrue();
        assertThat(service.hasPermission(USER, "publication", PUBLICATION.toString(), "write")).isFalse();
    }

    @Test
    void aPublicationWhoseProjectRowIsGoneGrantsNothing() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        Publication publication = mock(Publication.class);
        when(publication.getProjectId()).thenReturn(PROJECT);
        when(publications.findById(PUBLICATION)).thenReturn(Optional.of(publication));
        when(projects.findById(PROJECT)).thenReturn(Optional.empty());
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "publication", PUBLICATION.toString(), "read")).isFalse();
        assertThat(service.hasPermission(USER, "publication", PUBLICATION.toString(), "delete")).isFalse();
    }

    @Test
    void aMissingProjectRowIsAGhost_notAReadGrant() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        when(projects.findById(PROJECT)).thenReturn(Optional.empty());
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.hasPermission(USER, "project", PROJECT.toString(), "read")).isFalse();
    }

    @Test
    void anUnknownResourceTypeIsACallerBug_notADenial() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThatThrownBy(() -> service.hasPermission(USER, "world", PROJECT.toString(), "read"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("world");
        verifyNoInteractions(projects, publications);
    }

    @Test
    void aMissingUserIsARefusal_notASilentFalse() {
        when(users.findById(USER)).thenReturn(Optional.empty());
        PermissionService service = new PermissionService(users, projects, publications);

        assertThatThrownBy(() -> service.hasPermission(USER, "project", PROJECT.toString(), "read"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(USER.toString());
    }

    @Test
    void theAuthorityMirrorsTheLowercaseDatabaseLabel() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.CREATOR)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.getUserAuthority(USER)).isEqualTo("ROLE_creator");
        assertThat(service.isAdmin(USER)).isFalse();
    }

    @Test
    void adminIsRecognisedAndReported_lowercased() {
        when(users.findById(USER)).thenReturn(Optional.of(userWithRole(User.UserRole.ADMIN)));
        PermissionService service = new PermissionService(users, projects, publications);

        assertThat(service.isAdmin(USER)).isTrue();
        assertThat(service.getUserAuthority(USER)).isEqualTo("ROLE_admin");
    }
}
