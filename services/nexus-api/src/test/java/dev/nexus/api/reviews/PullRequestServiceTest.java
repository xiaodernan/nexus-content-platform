package dev.nexus.api.reviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.patches.IncidentPatch;
import dev.nexus.api.patches.NoSuchPatch;
import dev.nexus.api.patches.PatchService;
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
 * M9 v868 — the review-request rules, asserted one refusal at a time.
 *
 * <p>No Spring context and no database: these cases are about what the service DECIDES. The load-bearing
 * ones are the double-submit gate (a patch with an open request refuses a second, and the refusal must not
 * have moved the patch) and the ordering of the parent check before the fields.
 */
@ExtendWith(MockitoExtension.class)
class PullRequestServiceTest {

    private static final Instant AT = Instant.parse("2026-11-22T10:00:00Z");

    @Mock
    private PullRequestRepository repository;

    @Mock
    private PatchService patches;

    private PullRequestService service;

    @BeforeEach
    void setUp() {
        service = new PullRequestService(repository, patches, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static IncidentPatch patch(String id) {
        return new IncidentPatch(id, "i-1", "fix the lane", "because it is red", "+one line\n", "ada",
                PatchService.PROPOSED, AT);
    }

    private static PatchPullRequest request(String id, String patchId) {
        return new PatchPullRequest(id, patchId, "review the lane fix", null,
                PullRequestService.OPEN, "grace", AT);
    }

    private void allowOpen() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        when(patches.submit("p-1")).thenReturn(patch("p-1"));
        when(repository.countByPatchIdAndStatus("p-1", PullRequestService.OPEN)).thenReturn(0L);
        when(repository.save(any(PatchPullRequest.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── opening ────────────────────────────────────────────────────────────────────────────────────

    @Test
    void aRequestIsStoredOpenWithTheServiceClockAndThePatchIsSubmittedBesideIt() {
        allowOpen();

        PatchPullRequest opened = service.open("p-1", "  review the lane fix  ", "  it is red  ", "  grace  ");

        assertThat(opened.getPullRequestId()).isNotBlank();
        assertThat(opened.getPatchId()).isEqualTo("p-1");
        assertThat(opened.getTitle()).isEqualTo("review the lane fix");
        assertThat(opened.getSummary()).isEqualTo("it is red");
        assertThat(opened.getOpenedBy()).isEqualTo("grace");
        assertThat(opened.getStatus()).isEqualTo(PullRequestService.OPEN);
        assertThat(opened.getOpenedAt()).isEqualTo(AT);

        verify(patches).submit("p-1");
        verify(repository).save(any(PatchPullRequest.class));
    }

    @Test
    void anUnknownPatchIsNoSuchPatchBeforeAnythingIsStoredOrMoved() {
        when(patches.read("nope")).thenThrow(new NoSuchPatch("patch \"nope\" does not exist"));

        assertThatThrownBy(() -> service.open("nope", "review", null, null))
                .isInstanceOf(NoSuchPatch.class)
                .hasMessageContaining("nope");
        verifyNoInteractions(repository);
        verify(patches, never()).submit(any());
    }

    @Test
    void aPatchThatAlreadyHasAnOpenRequestIsRefusedAndThePatchIsNotMoved() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        when(repository.countByPatchIdAndStatus("p-1", PullRequestService.OPEN)).thenReturn(1L);

        assertThatThrownBy(() -> service.open("p-1", "review again", null, null))
                .isInstanceOf(AlreadyOpenPullRequest.class)
                .hasMessageContaining("already has an open review request");
        verify(repository, never()).save(any(PatchPullRequest.class));
        verify(patches, never()).submit(any());
    }

    @Test
    void aBlankTitleIsRefusedByName() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));

        assertThatThrownBy(() -> service.open("p-1", "   ", null, null))
                .isInstanceOf(InvalidPullRequest.class)
                .hasMessageContaining("needs a title");
        verify(repository, never()).save(any(PatchPullRequest.class));
    }

    @Test
    void aTitleOverTheColumnWidthIsRefusedNotTruncated() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        String tooLong = "a".repeat(PullRequestService.MAX_TITLE + 1);

        assertThatThrownBy(() -> service.open("p-1", tooLong, null, null))
                .isInstanceOf(InvalidPullRequest.class)
                .hasMessageContaining("at most " + PullRequestService.MAX_TITLE);
    }

    @Test
    void aBlankSummaryBecomesNullAndTheTextIsTrimmed() {
        allowOpen();

        PatchPullRequest trimmed = service.open("p-1", "review", "  because  ", null);
        PatchPullRequest blank = service.open("p-1", "review", "   ", null);

        assertThat(trimmed.getSummary()).isEqualTo("because");
        assertThat(blank.getSummary()).isNull();
    }

    @Test
    void aSummaryOverTheColumnWidthIsRefused() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        String tooLong = "a".repeat(PullRequestService.MAX_SUMMARY + 1);

        assertThatThrownBy(() -> service.open("p-1", "review", tooLong, null))
                .isInstanceOf(InvalidPullRequest.class)
                .hasMessageContaining("at most " + PullRequestService.MAX_SUMMARY);
    }

    @Test
    void anOpenerIsOptionalAndBlankBecomesNull() {
        allowOpen();

        PatchPullRequest opened = service.open("p-1", "review", null, "   ");

        assertThat(opened.getOpenedBy()).isNull();
    }

    @Test
    void anOpenerOverTheColumnWidthIsRefused() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        String tooLong = "a".repeat(PullRequestService.MAX_ACTOR + 1);

        assertThatThrownBy(() -> service.open("p-1", "review", null, tooLong))
                .isInstanceOf(InvalidPullRequest.class)
                .hasMessageContaining("at most " + PullRequestService.MAX_ACTOR);
    }

    // ── listing ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingIsScopedToThePatchAndAsksForTheNewestFirst() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        when(repository.findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(request("r-2", "p-1"), request("r-1", "p-1")));

        List<PatchPullRequest> rows = service.list("p-1", 5, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(
                org.mockito.ArgumentMatchers.eq("p-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(5);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(rows).hasSize(2);
    }

    @Test
    void theCapAndTheFlooredOffsetAreTheIncidentListingsRuleRatherThanACopy() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        when(repository.findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of());

        service.list("p-1", 500, -3);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPatchIdOrderByOpenedAtDescPullRequestIdDesc(any(), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(100);
        assertThat(window.getValue().getOffset()).isZero();
    }

    @Test
    void theCountIsScopedToTheSamePatchAsTheWindow() {
        when(patches.read("p-1")).thenReturn(patch("p-1"));
        when(repository.countByPatchId("p-1")).thenReturn(2L);

        assertThat(service.count("p-1")).isEqualTo(2L);
        verify(repository).countByPatchId("p-1");
    }

    @Test
    void listingAnUnknownPatchIsNoSuchPatchAndNoWindowIsRead() {
        when(patches.read("nope")).thenThrow(new NoSuchPatch("patch \"nope\" does not exist"));

        assertThatThrownBy(() -> service.list("nope", 20, 0))
                .isInstanceOf(NoSuchPatch.class);
        verifyNoInteractions(repository);
    }

    // ── reading ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void readingARequestAnswersWhatWasRecorded() {
        when(repository.findById("r-1")).thenReturn(Optional.of(request("r-1", "p-1")));

        PatchPullRequest read = service.read("r-1");

        assertThat(read.getPatchId()).isEqualTo("p-1");
        assertThat(read.getStatus()).isEqualTo(PullRequestService.OPEN);
        assertThat(read.getOpenedBy()).isEqualTo("grace");
    }

    @Test
    void readingAnIdThatNamesNothingIsNoSuchPullRequestAndTheMessageNamesIt() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchPullRequest.class)
                .hasMessageContaining("nope")
                .hasMessageContaining("does not exist");
    }

    @Test
    void readingABlankIdIsRefusedBeforeTheTableIsAsked() {
        assertThatThrownBy(() -> service.read("   "))
                .isInstanceOf(InvalidPullRequest.class)
                .hasMessageContaining("id is required");
        verifyNoInteractions(repository);
    }
}
