package dev.nexus.api.reviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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
 * M9 v869 — the decision rules, asserted one refusal at a time.
 *
 * <p>The load-bearing case is {@link #aSecondVerdictIsAlreadyDecidedAndNothingIsWritten()}: the gate is the
 * atomic UPDATE's moved-row count, not a read-then-write check, and the refusal must not touch the patch.
 */
@ExtendWith(MockitoExtension.class)
class DecisionServiceTest {

    private static final Instant AT = Instant.parse("2026-11-22T12:00:00Z");

    @Mock
    private DecisionRepository repository;

    @Mock
    private PullRequestService requests;

    @Mock
    private PatchService patches;

    private DecisionService service;

    @BeforeEach
    void setUp() {
        service = new DecisionService(repository, requests, patches, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static PatchPullRequest request(String id) {
        return new PatchPullRequest(id, "p-1", "review the lane fix", null,
                PullRequestService.OPEN, "grace", AT);
    }

    private static PullRequestDecision decision(String id, String verdict) {
        return new PullRequestDecision(id, "r-1", verdict, null, "ada", AT);
    }

    private void allowDecision() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(requests.closeIfOpen("r-1", DecisionService.APPROVED)).thenReturn(1);
        when(repository.save(any(PullRequestDecision.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── deciding ──────────────────────────────────────────────────────────────────────────────────

    @Test
    void anApprovalIsStoredWithTheServiceClockAndTheRequestAndPatchMoveWithIt() {
        allowDecision();

        PullRequestDecision stored = service.decide("r-1", "approved", "  it is the smallest fix  ", "  ada  ");

        assertThat(stored.getDecisionId()).isNotBlank();
        assertThat(stored.getPullRequestId()).isEqualTo("r-1");
        assertThat(stored.getVerdict()).isEqualTo(DecisionService.APPROVED);
        assertThat(stored.getReason()).isEqualTo("it is the smallest fix");
        assertThat(stored.getDecidedBy()).isEqualTo("ada");
        assertThat(stored.getDecidedAt()).isEqualTo(AT);
        verify(requests).closeIfOpen("r-1", DecisionService.APPROVED);
        verify(patches).approve("p-1");
        verify(patches, never()).revise(anyString());
        verify(repository).save(any(PullRequestDecision.class));
    }

    @Test
    void aRejectionIsStoredAndThePatchGoesBackForRevision() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(requests.closeIfOpen("r-1", DecisionService.REJECTED)).thenReturn(1);
        when(repository.save(any(PullRequestDecision.class))).thenAnswer(inv -> inv.getArgument(0));

        PullRequestDecision stored = service.decide("r-1", "rejected", "the drift is upstream", "grace");

        assertThat(stored.getVerdict()).isEqualTo(DecisionService.REJECTED);
        verify(patches).revise("p-1");
        verify(patches, never()).approve(anyString());
    }

    @Test
    void anUnknownRequestIsNoSuchPullRequestBeforeAnythingIsWritten() {
        when(requests.read("nope")).thenThrow(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThatThrownBy(() -> service.decide("nope", "approved", null, null))
                .isInstanceOf(NoSuchPullRequest.class)
                .hasMessageContaining("nope");
        verifyNoInteractions(repository);
        verify(requests, never()).closeIfOpen(anyString(), anyString());
    }

    @Test
    void aSecondVerdictIsAlreadyDecidedAndNothingIsWritten() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(requests.closeIfOpen("r-1", DecisionService.APPROVED)).thenReturn(0);

        assertThatThrownBy(() -> service.decide("r-1", "approved", null, null))
                .isInstanceOf(AlreadyDecided.class)
                .hasMessageContaining("no longer open");
        verify(repository, never()).save(any(PullRequestDecision.class));
        verify(patches, never()).approve(anyString());
        verify(patches, never()).revise(anyString());
    }

    @Test
    void theGateIsTheUpdatesMovedRowsAndNeverACount() {
        allowDecision();

        service.decide("r-1", "approved", null, null);

        verify(requests).closeIfOpen("r-1", DecisionService.APPROVED);
        verify(requests, never()).count(anyString());
        verify(repository, never()).countByPullRequestId(anyString());
    }

    @Test
    void aBlankVerdictIsRefusedByName() {
        when(requests.read("r-1")).thenReturn(request("r-1"));

        assertThatThrownBy(() -> service.decide("r-1", "   ", null, null))
                .isInstanceOf(InvalidDecision.class)
                .hasMessageContaining("needs a verdict");
        verify(requests, never()).closeIfOpen(anyString(), anyString());
    }

    @Test
    void anUnknownVerdictIsRefusedWithTheVocabularyNamedAndNoCaseFolding() {
        when(requests.read("r-1")).thenReturn(request("r-1"));

        assertThatThrownBy(() -> service.decide("r-1", "Approved", null, null))
                .isInstanceOf(InvalidDecision.class)
                .hasMessageContaining("approved")
                .hasMessageContaining("rejected")
                .hasMessageContaining("matched exactly");
    }

    @Test
    void aReasonOverTheColumnWidthIsRefused() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        String tooLong = "a".repeat(DecisionService.MAX_REASON + 1);

        assertThatThrownBy(() -> service.decide("r-1", "approved", tooLong, null))
                .isInstanceOf(InvalidDecision.class)
                .hasMessageContaining("at most " + DecisionService.MAX_REASON);
    }

    @Test
    void aBlankReasonBecomesNullAndTheTextIsTrimmed() {
        allowDecision();

        PullRequestDecision trimmed = service.decide("r-1", "approved", "  because  ", null);
        PullRequestDecision blank = service.decide("r-1", "approved", "   ", null);

        assertThat(trimmed.getReason()).isEqualTo("because");
        assertThat(blank.getReason()).isNull();
    }

    @Test
    void aReviewerOverTheColumnWidthIsRefused() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        String tooLong = "a".repeat(DecisionService.MAX_ACTOR + 1);

        assertThatThrownBy(() -> service.decide("r-1", "approved", null, tooLong))
                .isInstanceOf(InvalidDecision.class)
                .hasMessageContaining("at most " + DecisionService.MAX_ACTOR);
    }

    @Test
    void aBlankReviewerBecomesNull() {
        allowDecision();

        PullRequestDecision stored = service.decide("r-1", "approved", null, "   ");

        assertThat(stored.getDecidedBy()).isNull();
    }

    // ── listing ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingIsScopedToTheRequestAndAsksForTheNewestFirst() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(repository.findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(decision("d-1", DecisionService.APPROVED)));

        List<PullRequestDecision> rows = service.list("r-1", 5, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(
                org.mockito.ArgumentMatchers.eq("r-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(5);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(rows).hasSize(1);
    }

    @Test
    void theCapAndTheFlooredOffsetAreTheSharedRuleRatherThanACopy() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(repository.findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of());

        service.list("r-1", 500, -3);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPullRequestIdOrderByDecidedAtDescDecisionIdDesc(any(), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(100);
        assertThat(window.getValue().getOffset()).isZero();
    }

    @Test
    void theCountIsScopedToTheSameRequestAsTheWindow() {
        when(requests.read("r-1")).thenReturn(request("r-1"));
        when(repository.countByPullRequestId("r-1")).thenReturn(1L);

        assertThat(service.count("r-1")).isEqualTo(1L);
        verify(repository).countByPullRequestId("r-1");
    }

    @Test
    void listingAnUnknownRequestIsNoSuchPullRequestAndNoWindowIsRead() {
        when(requests.read("nope")).thenThrow(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThatThrownBy(() -> service.list("nope", 20, 0))
                .isInstanceOf(NoSuchPullRequest.class);
        verifyNoInteractions(repository);
    }

    // ── reading ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void readingADecisionAnswersWhatWasRecorded() {
        when(repository.findById("d-1")).thenReturn(Optional.of(decision("d-1", DecisionService.APPROVED)));

        PullRequestDecision read = service.read("d-1");

        assertThat(read.getPullRequestId()).isEqualTo("r-1");
        assertThat(read.getVerdict()).isEqualTo(DecisionService.APPROVED);
        assertThat(read.getDecidedBy()).isEqualTo("ada");
    }

    @Test
    void readingAnIdThatNamesNothingIsNoSuchDecisionAndTheMessageNamesIt() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchDecision.class)
                .hasMessageContaining("nope")
                .hasMessageContaining("does not exist");
    }

    @Test
    void readingABlankIdIsRefusedBeforeTheTableIsAsked() {
        assertThatThrownBy(() -> service.read("   "))
                .isInstanceOf(InvalidDecision.class)
                .hasMessageContaining("id is required");
        verifyNoInteractions(repository);
    }
}
