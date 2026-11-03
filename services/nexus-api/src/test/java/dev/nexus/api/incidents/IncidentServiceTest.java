package dev.nexus.api.incidents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * M9 v594 — the incident rules, asserted one refusal at a time.
 *
 * <p>No Spring context and no database: these cases are about what the service DECIDES. The clock is pinned,
 * so the instants a row records are asserted rather than read back and compared to themselves.
 */
@ExtendWith(MockitoExtension.class)
class IncidentServiceTest {

    private static final Instant AT = Instant.parse("2026-11-03T09:00:00Z");

    @Mock
    private IncidentRepository repository;

    private IncidentService service;

    @BeforeEach
    void setUp() {
        service = new IncidentService(repository, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static Incident row(String id, String status, String openedBy) {
        return new Incident(id, "the deploy lane is red", null, "high", null, null, status, openedBy, AT);
    }

    /** The one stub an open that should succeed needs: the save answers the row it was given. */
    private void allowSave() {
        when(repository.save(any(Incident.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── opening ────────────────────────────────────────────────────────────────────────────────────

    @Test
    void anIncidentIsStoredOpenWithTheServicesClockAndTheTrimmedWords() {
        allowSave();

        Incident opened = service.open(
                "  the deploy lane is red  ", null, "high", null, null, "  acct-ada  ");

        assertThat(opened.getIncidentId()).isNotBlank();
        assertThat(opened.getTitle()).isEqualTo("the deploy lane is red");
        assertThat(opened.getSummary()).isNull();
        assertThat(opened.getSeverity()).isEqualTo("high");
        assertThat(opened.getTargetKind()).isNull();
        assertThat(opened.getTargetId()).isNull();
        assertThat(opened.getStatus()).isEqualTo(IncidentService.OPEN);
        assertThat(opened.getOpenedBy()).isEqualTo("acct-ada");
        assertThat(opened.getOpenedAt()).isEqualTo(AT);
        assertThat(opened.getResolvedBy()).isNull();
        assertThat(opened.getResolvedAt()).isNull();
        verify(repository).save(any(Incident.class));
    }

    @Test
    void aBlankTitleIsRefusedByNameBeforeAnythingIsStored() {
        assertThatThrownBy(() -> service.open("   ", null, "high", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("needs a title");
        verifyNoInteractions(repository);
    }

    @Test
    void aTitleOverTheColumnWidthIsRefusedNotTruncated() {
        String tooLong = "a".repeat(IncidentService.MAX_TITLE + 1);
        assertThatThrownBy(() -> service.open(tooLong, null, "low", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("at most " + IncidentService.MAX_TITLE)
                .hasMessageContaining("this one is " + tooLong.length());
    }

    @Test
    void aSummaryIsTrimmedAndTheTextTheCallerTypedIsNotKept() {
        allowSave();

        Incident opened = service.open("red lane", "  the runner never finished  ", "high", null, null, null);

        assertThat(opened.getSummary()).isEqualTo("the runner never finished");
    }

    @Test
    void aBlankSummaryBecomesNullSoSilenceHasOneRepresentation() {
        allowSave();

        Incident opened = service.open("red lane", "   ", "high", null, null, null);

        assertThat(opened.getSummary()).isNull();
    }

    @Test
    void aSummaryOverTheColumnWidthIsRefused() {
        String tooLong = "a".repeat(IncidentService.MAX_SUMMARY + 1);
        assertThatThrownBy(() -> service.open("red lane", tooLong, "high", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("at most " + IncidentService.MAX_SUMMARY);
    }

    @Test
    void aSeverityOutsideTheVocabularyIsRefusedAndCaseIsNotFolded() {
        assertThatThrownBy(() -> service.open("red lane", null, "High", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("no case folding");
        assertThatThrownBy(() -> service.open("red lane", null, "urgent", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("low, medium, high, critical");
    }

    @Test
    void aMissingSeverityIsRefusedRatherThanDefaulted() {
        assertThatThrownBy(() -> service.open("red lane", null, "  ", null, null, null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("needs a severity");
    }

    @Test
    void aTargetNeedsBothAHalfAndAKind() {
        assertThatThrownBy(() -> service.open("red lane", null, "high", "tool", "  ", null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("without a target id");
        assertThatThrownBy(() -> service.open("red lane", null, "high", null, "tool-1", null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("without a target kind");
    }

    @Test
    void aTargetIsTrimmedAndKeptAsAPair() {
        allowSave();

        Incident opened = service.open("red lane", null, "high", "  tool  ", "  tool-1  ", null);

        assertThat(opened.getTargetKind()).isEqualTo("tool");
        assertThat(opened.getTargetId()).isEqualTo("tool-1");
    }

    @Test
    void anOpenedByIsOptionalAndABlankOneBecomesNull() {
        allowSave();

        Incident opened = service.open("red lane", null, "low", null, null, "   ");

        assertThat(opened.getOpenedBy()).isNull();
    }

    @Test
    void anOpenedByOverTheColumnWidthIsRefused() {
        String tooLong = "a".repeat(IncidentService.MAX_ACTOR + 1);
        assertThatThrownBy(() -> service.open("red lane", null, "low", null, null, tooLong))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("at most " + IncidentService.MAX_ACTOR);
    }

    // ── listing ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingAsksForTheNewestFirstWithTheWindowItWasGiven() {
        when(repository.findAllByOrderByOpenedAtDescIncidentIdDesc(any(Pageable.class)))
                .thenReturn(List.of(row("i-2", "open", null), row("i-1", "open", null)));

        List<Incident> rows = service.list(5, 0, null, null);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByOpenedAtDescIncidentIdDesc(window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(5);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(rows).hasSize(2);
    }

    @Test
    void aSeverityFilterNarrowsTheQueryRatherThanTheAnswer() {
        when(repository.findBySeverityOrderByOpenedAtDescIncidentIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(row("i-1", "open", null)));

        List<Incident> rows = service.list(20, 0, null, "critical");

        verify(repository).findBySeverityOrderByOpenedAtDescIncidentIdDesc(
                eq("critical"), any(Pageable.class));
        assertThat(rows).hasSize(1);
    }

    @Test
    void aStatusFilterNarrowsTheQueryRatherThanTheAnswer() {
        when(repository.findByStatusOrderByOpenedAtDescIncidentIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(row("i-1", "resolved", "ada")));

        List<Incident> rows = service.list(20, 0, "resolved", null);

        verify(repository).findByStatusOrderByOpenedAtDescIncidentIdDesc(
                eq("resolved"), any(Pageable.class));
        assertThat(rows).hasSize(1);
    }

    @Test
    void bothFiltersNarrowTogetherInOneQuery() {
        when(repository.findByStatusAndSeverityOrderByOpenedAtDescIncidentIdDesc(any(), any(), any(Pageable.class)))
                .thenReturn(List.of());

        service.list(20, 0, "open", "high");

        verify(repository).findByStatusAndSeverityOrderByOpenedAtDescIncidentIdDesc(
                eq("open"), eq("high"), any(Pageable.class));
    }

    @Test
    void aFilterOutsideTheVocabularyIsRefusedRatherThanAnsweredWithAnEmptyWindow() {
        assertThatThrownBy(() -> service.list(20, 0, "closed", null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("closed")
                .hasMessageContaining("one of");
        assertThatThrownBy(() -> service.list(20, 0, null, "HIGH"))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("is not a severity");
        assertThatThrownBy(() -> service.list(20, 0, "   ", null))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("filter is blank");
        verifyNoInteractions(repository);
    }

    @Test
    void theLimitIsCappedTheFloorIsOneAndANegativeOffsetReadsFromTheFirstRow() {
        when(repository.findAllByOrderByOpenedAtDescIncidentIdDesc(any(Pageable.class))).thenReturn(List.of());

        service.list(500, -3, null, null);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByOpenedAtDescIncidentIdDesc(window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(IncidentService.MAX_LIST_LIMIT);
        assertThat(window.getValue().getOffset()).isZero();
    }

    @Test
    void anOffsetIsAWindowCountAndTheServiceReadsFromThePageThatContainsIt() {
        when(repository.findAllByOrderByOpenedAtDescIncidentIdDesc(any(Pageable.class))).thenReturn(List.of());

        service.list(10, 15, null, null);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByOpenedAtDescIncidentIdDesc(window.capture());
        // 15 rows floored to the window of 10 that contains row 15 is the page starting at 10, not 20.
        assertThat(window.getValue().getOffset()).isEqualTo(10);
        assertThat(IncidentService.appliedOffset(15, 10)).isEqualTo(10);
    }

    @Test
    void theCountIsNarrowedWithTheListingAndNamesTheWholeSet() {
        when(repository.count()).thenReturn(4L);
        when(repository.countByStatus("open")).thenReturn(3L);
        when(repository.countBySeverity("critical")).thenReturn(1L);
        when(repository.countByStatusAndSeverity("open", "high")).thenReturn(2L);

        assertThat(service.count(null, null)).isEqualTo(4L);
        assertThat(service.count("open", null)).isEqualTo(3L);
        assertThat(service.count(null, "critical")).isEqualTo(1L);
        assertThat(service.count("open", "high")).isEqualTo(2L);
    }

    // ── reading and resolving ─────────────────────────────────────────────────────────────────────

    @Test
    void readingAnIdThatNamesNothingIsNoSuchIncidentAndTheMessageNamesIt() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchIncident.class)
                .hasMessageContaining("nope")
                .hasMessageContaining("does not exist");
    }

    @Test
    void readingABlankIdIsRefusedBeforeTheTableIsAsked() {
        assertThatThrownBy(() -> service.read("   "))
                .isInstanceOf(InvalidIncident.class)
                .hasMessageContaining("id is required");
        verifyNoInteractions(repository);
    }

    @Test
    void aResolveStampsWhoAndWhenAndFlipsTheStatus() {
        Incident open = row("i-1", "open", "acct-ada");
        when(repository.findById("i-1")).thenReturn(Optional.of(open));
        allowSave();

        Incident resolved = service.resolve("i-1", "  ada  ");

        assertThat(resolved.getStatus()).isEqualTo(IncidentService.RESOLVED);
        assertThat(resolved.getResolvedBy()).isEqualTo("ada");
        assertThat(resolved.getResolvedAt()).isEqualTo(AT);
        verify(repository).save(any(Incident.class));
    }

    @Test
    void aBlankResolverBecomesNullAndTheInstantIsStillWritten() {
        Incident open = row("i-1", "open", null);
        when(repository.findById("i-1")).thenReturn(Optional.of(open));
        allowSave();

        Incident resolved = service.resolve("i-1", "   ");

        assertThat(resolved.getResolvedBy()).isNull();
        assertThat(resolved.getResolvedAt()).isEqualTo(AT);
    }

    @Test
    void aResolveOfAnUnknownIdIsNoSuchIncident() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resolve("nope", "ada"))
                .isInstanceOf(NoSuchIncident.class);
        verify(repository, never()).save(any(Incident.class));
    }

    @Test
    void aSecondResolveIsRefusedAndTheFirstResolverIsNotOverwritten() {
        Incident closed = row("i-1", "resolved", "acct-ada");
        closed.resolve("ada", AT);
        when(repository.findById("i-1")).thenReturn(Optional.of(closed));

        assertThatThrownBy(() -> service.resolve("i-1", "grace"))
                .isInstanceOf(AlreadyResolved.class)
                .hasMessageContaining("already resolved");
        assertThat(closed.getResolvedBy()).isEqualTo("ada");
        verify(repository, never()).save(any(Incident.class));
    }
}
