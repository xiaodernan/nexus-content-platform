package com.nexus.domain.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The project domain service, graded over a mocked repository — no Spring context, no database.
 *
 * <p>These are the rules the HTTP surface rests on, so they are the rules worth pinning:
 *
 * <ul>
 *   <li>a new project starts <b>private</b> and of kind {@code website} unless told otherwise — the
 *       default is the service's, not the caller's;</li>
 *   <li>an update changes <b>only</b> the fields it was given — a {@code null} means "leave it",
 *       not "clear it";</li>
 *   <li>an update of a project the service does not hold <b>refuses by name</b>;</li>
 *   <li>a delete is <b>soft</b>: the row is stamped, not removed;</li>
 *   <li>a fork gets a <b>fresh id</b> and records where it came from — a fork that kept the
 *       original's id would overwrite the project it was copied from.</li>
 * </ul>
 *
 * <p>The last one is the same rule the remix lane in the web layer follows, and it is the one worth
 * being most careful about: two rows sharing an id is a silent data loss.
 */
@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock
    private ProjectRepository repository;

    private ProjectService service;

    @BeforeEach
    void setUp() {
        service = new ProjectService(repository);
    }

    /**
     * The repository hands back what it was given, the way a real JPA repository does.
     *
     * <p>Stubbed per test rather than in {@code setUp}: Mockito's strict stubs refuse a stubbing
     * nobody used, and the two refusal cases never reach {@code save} — so a shared stubbing would
     * fail them for a reason that has nothing to do with what they are proving.
     */
    private void stubSaveReturningTheRow() {
        when(repository.save(any(Project.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void aNewProjectStartsPrivateAndOfKindWebsite() {
        stubSaveReturningTheRow();
        UUID owner = UUID.randomUUID();

        Project created = service.createProject(owner, "my-slug", "My Project", null, "a description");

        assertThat(created.getId()).isNotNull();
        assertThat(created.getOwnerId()).isEqualTo(owner);
        assertThat(created.getSlug()).isEqualTo("my-slug");
        assertThat(created.getName()).isEqualTo("My Project");
        assertThat(created.getDescription()).isEqualTo("a description");
        assertThat(created.getKind()).isEqualTo("website");
        assertThat(created.getVisibility()).isEqualTo("private");
        assertThat(created.getDeletedAt()).isNull();
        verify(repository).save(any(Project.class));
    }

    @Test
    void anExplicitKindIsKeptAndTheDefaultIsNotAppliedOverIt() {
        stubSaveReturningTheRow();
        Project created = service.createProject(UUID.randomUUID(), "s", "n", "game", null);

        assertThat(created.getKind()).isEqualTo("game");
    }

    @Test
    void anUpdateChangesOnlyTheFieldsItWasGiven() {
        stubSaveReturningTheRow();
        UUID id = UUID.randomUUID();
        Project existing = existing(id);
        when(repository.findById(id)).thenReturn(Optional.of(existing));

        Project updated = service.updateProject(id, "New Name", null, "public");

        assertThat(updated.getName()).isEqualTo("New Name");
        assertThat(updated.getVisibility()).isEqualTo("public");
        // A null means "leave it alone" — not "clear it".
        assertThat(updated.getDescription()).isEqualTo("the original description");
        assertThat(updated.getSlug()).isEqualTo("the-original-slug");
    }

    @Test
    void anUpdateOfAProjectTheServiceDoesNotHoldRefusesByName() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateProject(id, "New Name", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Project not found")
                .hasMessageContaining(id.toString());
    }

    @Test
    void aDeleteIsSoftTheRowIsStampedAndKept() {
        stubSaveReturningTheRow();
        UUID id = UUID.randomUUID();
        Project existing = existing(id);
        when(repository.findById(id)).thenReturn(Optional.of(existing));

        service.deleteProject(id);

        assertThat(existing.getDeletedAt())
                .as("a soft delete stamps the row; it does not remove it")
                .isNotNull();
        verify(repository).save(existing);
    }

    @Test
    void aForkGetsAFreshIdAndRecordsWhereItCameFrom() {
        stubSaveReturningTheRow();
        UUID originalId = UUID.randomUUID();
        UUID newOwner = UUID.randomUUID();
        Project original = existing(originalId);
        original.setKind("game");
        when(repository.findById(originalId)).thenReturn(Optional.of(original));

        Project fork = service.forkProject(originalId, newOwner, "the-fork", "The Fork");

        assertThat(fork.getId())
                .as("a fork that kept the original's id would overwrite the project it was copied from")
                .isNotNull()
                .isNotEqualTo(originalId);
        assertThat(fork.getForkOf()).isEqualTo(originalId);
        assertThat(fork.getOwnerId()).isEqualTo(newOwner);
        assertThat(fork.getSlug()).isEqualTo("the-fork");
        assertThat(fork.getKind()).isEqualTo("game");
        assertThat(fork.getVisibility()).isEqualTo("private");
        assertThat(fork.getDescription()).contains(original.getName());
    }

    @Test
    void aForkOfAProjectThatDoesNotExistRefusesByName() {
        UUID originalId = UUID.randomUUID();
        when(repository.findById(originalId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.forkProject(originalId, UUID.randomUUID(), "s", "n"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Original project not found");
    }

    private static Project existing(UUID id) {
        Project project = new Project();
        project.setId(id);
        project.setOwnerId(UUID.randomUUID());
        project.setSlug("the-original-slug");
        project.setName("The Original");
        project.setDescription("the original description");
        project.setVisibility("private");
        project.setKind("website");
        return project;
    }
}
