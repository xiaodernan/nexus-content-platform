package dev.nexus.api.patches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.incidents.NoSuchIncident;
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
 * M9 v595 — the patch rules, asserted one refusal at a time.
 *
 * <p>No Spring context and no database: these cases are about what the service DECIDES. The diff cases are
 * the load-bearing ones — the bytes must come back exactly as they were written, whitespace included,
 * because a service that trims a patch has edited the thing it claims to record.
 */
@ExtendWith(MockitoExtension.class)
class PatchServiceTest {

    private static final Instant AT = Instant.parse("2026-11-03T10:00:00Z");

    @Mock
    private PatchRepository repository;

    @Mock
    private IncidentService incidents;

    private PatchService service;

    @BeforeEach
    void setUp() {
        service = new PatchService(repository, incidents, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static IncidentPatch row(String id, String incidentId, String diff) {
        return new IncidentPatch(id, incidentId, "fix the lane", null, diff, null,
                PatchService.PROPOSED, AT);
    }

    private void allowSave() {
        when(repository.save(any(IncidentPatch.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── proposing ──────────────────────────────────────────────────────────────────────────────────

    @Test
    void aPatchIsStoredProposedWithTheServiceClockAndTheBytesUnchanged() {
        allowSave();
        String diff = "  context line\n\tdetail line\n\n";

        IncidentPatch opened = service.open("i-1", "  fix the lane  ", "  because it is red  ", diff, "  ada  ");

        assertThat(opened.getPatchId()).isNotBlank();
        assertThat(opened.getIncidentId()).isEqualTo("i-1");
        assertThat(opened.getTitle()).isEqualTo("fix the lane");
        assertThat(opened.getSummary()).isEqualTo("because it is red");
        assertThat(opened.getDiff()).isEqualTo(diff);
        assertThat(opened.getAuthor()).isEqualTo("ada");
        assertThat(opened.getStatus()).isEqualTo(PatchService.PROPOSED);
        assertThat(opened.getCreatedAt()).isEqualTo(AT);
        verify(repository).save(any(IncidentPatch.class));
    }

    @Test
    void anUnknownIncidentIsNoSuchIncidentBeforeAnythingIsStored() {
        when(incidents.read("nope")).thenThrow(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThatThrownBy(() -> service.open("nope", "fix", null, "+one line", null))
                .isInstanceOf(NoSuchIncident.class)
                .hasMessageContaining("nope");
        verifyNoInteractions(repository);
    }

    @Test
    void aBlankTitleIsRefusedByName() {
        assertThatThrownBy(() -> service.open("i-1", "   ", null, "+one line", null))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("needs a title");
        verifyNoInteractions(repository);
    }

    @Test
    void aTitleOverTheColumnWidthIsRefusedNotTruncated() {
        String tooLong = "a".repeat(PatchService.MAX_TITLE + 1);
        assertThatThrownBy(() -> service.open("i-1", tooLong, null, "+one line", null))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("at most " + PatchService.MAX_TITLE);
    }

    @Test
    void aDiffOfOnlyWhitespaceIsRefusedBecauseZeroBytesProposeNothing() {
        assertThatThrownBy(() -> service.open("i-1", "fix", null, "  \n\t \n", null))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("proposes nothing");
    }

    @Test
    void aDiffOverTheColumnWidthIsRefusedRatherThanCut() {
        String tooLong = "+".repeat(PatchService.MAX_DIFF + 1);
        assertThatThrownBy(() -> service.open("i-1", "fix", null, tooLong, null))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("at most " + PatchService.MAX_DIFF)
                .hasMessageContaining("refused rather than cut");
    }

    @Test
    void aDiffAtTheBoundIsAccepted() {
        allowSave();
        String atBound = "+" + "a".repeat(PatchService.MAX_DIFF - 1);

        IncidentPatch opened = service.open("i-1", "fix", null, atBound, null);

        assertThat(opened.getDiff()).hasSize(PatchService.MAX_DIFF);
    }

    @Test
    void aBlankSummaryBecomesNullAndTheTextIsTrimmed() {
        allowSave();

        IncidentPatch trimmed = service.open("i-1", "fix", "  because  ", "+one", null);
        IncidentPatch blank = service.open("i-1", "fix", "   ", "+one", null);

        assertThat(trimmed.getSummary()).isEqualTo("because");
        assertThat(blank.getSummary()).isNull();
    }

    @Test
    void aSummaryOverTheColumnWidthIsRefused() {
        String tooLong = "a".repeat(PatchService.MAX_SUMMARY + 1);
        assertThatThrownBy(() -> service.open("i-1", "fix", tooLong, "+one", null))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("at most " + PatchService.MAX_SUMMARY);
    }

    @Test
    void anAuthorIsOptionalAndBlankBecomesNull() {
        allowSave();

        IncidentPatch opened = service.open("i-1", "fix", null, "+one", "   ");

        assertThat(opened.getAuthor()).isNull();
    }

    @Test
    void anAuthorOverTheColumnWidthIsRefused() {
        String tooLong = "a".repeat(PatchService.MAX_ACTOR + 1);
        assertThatThrownBy(() -> service.open("i-1", "fix", null, "+one", tooLong))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("at most " + PatchService.MAX_ACTOR);
    }

    // ── listing ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingIsScopedToTheIncidentAndAsksForTheNewestFirst() {
        when(repository.findByIncidentIdOrderByCreatedAtDescPatchIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(row("p-2", "i-1", "+two"), row("p-1", "i-1", "+one")));

        List<IncidentPatch> rows = service.list("i-1", 5, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByIncidentIdOrderByCreatedAtDescPatchIdDesc(
                org.mockito.ArgumentMatchers.eq("i-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(5);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(rows).hasSize(2);
    }

    @Test
    void theCapAndTheFlooredOffsetAreTheIncidentListingsRuleRatherThanACopy() {
        when(repository.findByIncidentIdOrderByCreatedAtDescPatchIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of());

        service.list("i-1", 500, -3);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByIncidentIdOrderByCreatedAtDescPatchIdDesc(any(), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(IncidentService.MAX_LIST_LIMIT);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(IncidentService.appliedOffset(15, 10)).isEqualTo(10);
    }

    @Test
    void theCountIsScopedToTheSameIncidentAsTheWindow() {
        when(repository.countByIncidentId("i-1")).thenReturn(3L);

        assertThat(service.count("i-1")).isEqualTo(3L);
        verify(repository).countByIncidentId("i-1");
    }

    @Test
    void listingAnUnknownIncidentIsNoSuchIncidentAndNoWindowIsRead() {
        when(incidents.read("nope")).thenThrow(new NoSuchIncident("incident \"nope\" does not exist"));

        assertThatThrownBy(() -> service.list("nope", 20, 0))
                .isInstanceOf(NoSuchIncident.class);
        verifyNoInteractions(repository);
    }

    // ── reading ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void readingAPatchAnswersTheBytesItWasWrittenWith() {
        when(repository.findById("p-1")).thenReturn(Optional.of(row("p-1", "i-1", "  context\n+detail\n")));

        IncidentPatch read = service.read("p-1");

        assertThat(read.getDiff()).isEqualTo("  context\n+detail\n");
    }

    @Test
    void readingAnIdThatNamesNothingIsNoSuchPatchAndTheMessageNamesIt() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchPatch.class)
                .hasMessageContaining("nope")
                .hasMessageContaining("does not exist");
    }

    @Test
    void readingABlankIdIsRefusedBeforeTheTableIsAsked() {
        assertThatThrownBy(() -> service.read("   "))
                .isInstanceOf(InvalidPatch.class)
                .hasMessageContaining("id is required");
        verifyNoInteractions(repository);
    }
}
