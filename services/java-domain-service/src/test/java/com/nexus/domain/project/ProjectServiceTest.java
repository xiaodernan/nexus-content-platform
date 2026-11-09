package com.nexus.domain.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The project WRITE path, graded without a database.
 *
 * <p>These are the rules the service owns — defaults applied on create, the not-found errors, what a fork
 * copies — as opposed to what the schema or the controller enforce. A rule tested here would still be
 * wrong if the repository were wired to the wrong table, which is why the live run in the README exists
 * too; what this class can say is that the service logic is what the code below describes.
 */
@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock
    private ProjectRepository repository;

    @InjectMocks
    private ProjectService service;

    private static final UUID OWNER = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Test
    void createAppliesTheDefaultsAndGeneratesItsOwnId() {
        when(repository.save(any(Project.class))).thenAnswer(call -> call.getArgument(0));

        Project created = service.createProject(OWNER, "harbour", "Harbour", null, "A place");

        assertThat(created.getId()).isNotNull();
        assertThat(created.getOwnerId()).isEqualTo(OWNER);
        assertThat(created.getSlug()).isEqualTo("harbour");
        // A missing kind is not an error: the column is NOT NULL and "website" is this service's stated
        // default. A caller that omits it gets a real project, not a 500 from the database.
        assertThat(created.getKind()).isEqualTo("website");
        assertThat(created.getVisibility()).isEqualTo("private");
    }

    @Test
    void updateRefusesAProjectThatDoesNotExist() {
        UUID missing = UUID.randomUUID();
        when(repository.findById(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateProject(missing, "New", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(missing.toString());
    }

    @Test
    void softDeleteStampsDeletedAtAndNeverDropsTheRow() {
        Project existing = project();
        when(repository.findById(existing.getId())).thenReturn(Optional.of(existing));
        when(repository.save(any(Project.class))).thenAnswer(call -> call.getArgument(0));

        service.deleteProject(existing.getId());

        ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getDeletedAt()).isNotNull();
    }

    @Test
    void aForkCopiesTheKindAndPointsAtItsOriginal() {
        Project original = project();
        original.setKind("game");
        original.setName("Harbour");
        when(repository.findById(original.getId())).thenReturn(Optional.of(original));
        when(repository.save(any(Project.class))).thenAnswer(call -> call.getArgument(0));

        Project fork = service.forkProject(original.getId(), OWNER, "harbour-fork", "Harbour Fork");

        assertThat(fork.getForkOf()).isEqualTo(original.getId());
        assertThat(fork.getKind()).isEqualTo("game");
        assertThat(fork.getVisibility()).isEqualTo("private");
        assertThat(fork.getId()).isNotEqualTo(original.getId());
    }

    @Test
    void aSoftDeletedProjectIsNotReadable() {
        Project deleted = project();
        deleted.setDeletedAt(Instant.now());
        when(repository.findById(deleted.getId())).thenReturn(Optional.of(deleted));

        assertThat(service.getProjectById(deleted.getId())).isEmpty();
    }

    private static Project project() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setOwnerId(OWNER);
        project.setSlug("harbour");
        project.setName("Harbour");
        return project;
    }
}
