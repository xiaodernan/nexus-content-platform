package dev.nexus.api.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * What {@link AuditService} refuses, and what it records.
 *
 * <p>No Spring context and no database here on purpose — the same rule every service test here keeps:
 * these cases are about what the service DECIDES, and the database is what a proof drives for real.
 *
 * <p>v384 gave the trail a target TYPE — the kind of thing an entry happened to — declared by the caller
 * and validated here, because a kind guessed from an id's spelling would be wrong the day somebody named
 * a plan "account-something". These cases pin both halves: the closed set is enforced BY NAME, and what
 * is stored is what was declared.
 *
 * <p>The clock is PINNED, so the instant an entry records is asserted rather than read back and compared
 * to itself.
 *
 * <p>v385 gave the LISTING a filter that lives in the service: a named action narrows the query itself,
 * an action outside the recorded set is refused BY NAME before any window is read, and the whole-trail
 * count travels beside the window so a reader can still see what the filter is hiding.
 */
@ExtendWith(MockitoExtension.class)
class AuditServiceTest {

    private static final Instant AT = Instant.parse("2026-10-23T09:00:00Z");

    @Mock
    private AuditEntryRepository repository;

    private AuditService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(AT, ZoneOffset.UTC);
        service = new AuditService(repository, clock);
    }

    // ── what an entry must name ──────────────────────────────────────────────────────────────────────

    @Test
    void anEntryWithNoActionIsREFUSEDByName() {
        assertThatThrownBy(() -> service.record("  ", "acct-ada", null, null, "pub-1", AuditService.TARGET_PUBLICATION))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must name what happened");
        verify(repository, never()).save(any());
    }

    @Test
    void anEntryWithNoTargetIsREFUSEDByName() {
        assertThatThrownBy(() -> service.record("publish", "acct-ada", null, null, null, AuditService.TARGET_PUBLICATION))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must name what it happened to");
        verify(repository, never()).save(any());
    }

    // ── v384: the target's KIND is declared, and the set is closed ──────────────────────────────────

    @Test
    void anEntryWithNoTargetTypeIsREFUSEDAndTheRefusalNAMESTheThree() {
        assertThatThrownBy(() -> service.record("publish", "acct-ada", null, null, "pub-1", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("account")
                .hasMessageContaining("plan")
                .hasMessageContaining("publication");
        verify(repository, never()).save(any());
    }

    @Test
    void aTargetTypeOUTSIDETheThreeIsREFUSEDAndTheRefusalNAMESIt() {
        assertThatThrownBy(() -> service.record("publish", "acct-ada", null, null, "pub-1", "world"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("world")
                .hasMessageContaining("account, a plan or a publication");
        verify(repository, never()).save(any());
    }

    @Test
    void eachOfTheThreeKindsIsACCEPTEDAndStoredAsDeclared() {
        when(repository.save(any(AuditEntry.class))).thenAnswer(i -> i.getArgument(0));

        service.record("publish", "acct-ada", "ada", "unsigned-local", "pub-1", AuditService.TARGET_ACCOUNT);
        service.record("follow", "acct-bob", "bob", "unsigned-local", "acct-ada", AuditService.TARGET_PLAN);
        service.record("publish", "acct-ada", "ada", "unsigned-local", "pub-1", AuditService.TARGET_PUBLICATION);

        ArgumentCaptor<AuditEntry> saved = ArgumentCaptor.forClass(AuditEntry.class);
        verify(repository, times(3)).save(saved.capture());
        assertThat(saved.getAllValues())
                .extracting(AuditEntry::getTargetType)
                .containsExactly(AuditService.TARGET_ACCOUNT, AuditService.TARGET_PLAN, AuditService.TARGET_PUBLICATION);
    }

    @Test
    void anAnonymousEntryIsRecordedWithNoActorRatherThanAnInventedOne() {
        when(repository.save(any(AuditEntry.class))).thenAnswer(i -> i.getArgument(0));

        service.record("publish", null, null, null, "pub-1", AuditService.TARGET_PUBLICATION);

        ArgumentCaptor<AuditEntry> saved = ArgumentCaptor.forClass(AuditEntry.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getActorAccountId()).isNull();
        assertThat(saved.getValue().getActorHandle()).isNull();
        assertThat(saved.getValue().getActorAssurance()).isNull();
        assertThat(saved.getValue().getOccurredAt()).isEqualTo(AT);
    }

    // ── the listing is capped ───────────────────────────────────────────────────────────────────────

    @Test
    void theListingIsCappedAtTheServicesOwnCeiling() {
        service.list(10_000, null);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByOccurredAtDesc(window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(AuditService.MAX_LIST_LIMIT);
    }

    @Test
    void theListingOfANothingAskIsClampedToOneRatherThanREFUSED() {
        service.list(0, null);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByOccurredAtDesc(window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(1);
    }

    // ── v385: the filter is the SERVICE's, and the window is the filtered one ───────────────────────

    @Test
    void aNamedActionNarrowsTheListingInTheQUERYRatherThanInTheBrowser() {
        service.list(20, AuditService.ACTION_UNPUBLISH);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByActionOrderByOccurredAtDesc(eq(AuditService.ACTION_UNPUBLISH), window.capture());
        // The cap still applies to the FILTERED window: twenty of THAT action, not twenty of everything
        // that happen to carry it.
        assertThat(window.getValue().getPageSize()).isEqualTo(20);
        verify(repository, never()).findAllByOrderByOccurredAtDesc(any(Pageable.class));
    }

    @Test
    void noActionAskedIsTheWholeTrailAndNoFilterFinderIsTouched() {
        service.list(20, null);

        verify(repository).findAllByOrderByOccurredAtDesc(any(Pageable.class));
        verify(repository, never()).findByActionOrderByOccurredAtDesc(any(), any(Pageable.class));
    }

    @Test
    void aBlankActionIsTheWholeTrailNotAnEmptyWindow() {
        service.list(20, "   ");

        verify(repository).findAllByOrderByOccurredAtDesc(any(Pageable.class));
        verify(repository, never()).findByActionOrderByOccurredAtDesc(any(), any(Pageable.class));
    }

    @Test
    void anActionOUTSIDETheRecordedSetIsREFUSEDAndTheRefusalNAMESTheSet() {
        assertThatThrownBy(() -> service.list(20, "frobnicate"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("frobnicate")
                .hasMessageContaining(AuditService.ACTION_PUBLISH)
                .hasMessageContaining(AuditService.ACTION_ACKNOWLEDGE);
        // The refusal happens BEFORE the query: a window nobody asked for is never read.
        verify(repository, never()).findAllByOrderByOccurredAtDesc(any(Pageable.class));
        verify(repository, never()).findByActionOrderByOccurredAtDesc(any(), any(Pageable.class));
    }

    @Test
    void everyVerbTheSetNamesIsAQuestionTheServiceWillAnswer() {
        for (String action : AuditService.ACTIONS) {
            service.list(20, action);
        }

        ArgumentCaptor<String> asked = ArgumentCaptor.forClass(String.class);
        verify(repository, times(AuditService.ACTIONS.size()))
                .findByActionOrderByOccurredAtDesc(asked.capture(), any(Pageable.class));
        assertThat(asked.getAllValues()).containsExactlyElementsOf(AuditService.ACTIONS);
    }

    @Test
    void theCountIsTheWHOLETrailSoAFilterCanSayWhatItIsHiding() {
        when(repository.count()).thenReturn(137L);

        assertThat(service.count()).isEqualTo(137L);
    }
}