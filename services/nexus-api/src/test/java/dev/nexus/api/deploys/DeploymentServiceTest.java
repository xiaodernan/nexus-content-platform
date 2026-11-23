package dev.nexus.api.deploys;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.patches.PatchService;
import dev.nexus.api.reviews.NoSuchPullRequest;
import dev.nexus.api.reviews.PatchPullRequest;
import dev.nexus.api.reviews.PullRequestService;
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
 * M9 v870 — the deployment rules, asserted one refusal at a time.
 *
 * <p>The load-bearing cases are the approval gate (only an approved request may be deployed) and the
 * completion gate (the conditional UPDATE's moved-row count, never a read-then-write). No Spring context and
 * no database: these cases are about what the service DECIDES.
 */
@ExtendWith(MockitoExtension.class)
class DeploymentServiceTest {

    private static final Instant AT = Instant.parse("2026-11-22T14:00:00Z");

    @Mock
    private DeploymentRepository repository;

    @Mock
    private PullRequestService requests;

    @Mock
    private PatchService patches;

    private DeploymentService service;

    @BeforeEach
    void setUp() {
        service = new DeploymentService(repository, requests, patches, Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static PatchPullRequest request(String id, String status) {
        return new PatchPullRequest(id, "p-1", "review the lane fix", null, status, "grace", AT);
    }

    private static Deployment requested(String id) {
        return new Deployment(id, "r-1", "p-1", DeploymentService.STAGING,
                DeploymentService.REQUESTED, "ada", AT);
    }

    // ── requesting ────────────────────────────────────────────────────────────────────────────────

    @Test
    void aRequestIsStoredRequestedWithTheServiceClockAndThePatchItCameFrom() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        when(repository.save(any(Deployment.class))).thenAnswer(inv -> inv.getArgument(0));

        Deployment stored = service.request("r-1", "staging", "  ada  ");

        assertThat(stored.getDeploymentId()).isNotBlank();
        assertThat(stored.getPullRequestId()).isEqualTo("r-1");
        assertThat(stored.getPatchId()).isEqualTo("p-1");
        assertThat(stored.getEnvironment()).isEqualTo(DeploymentService.STAGING);
        assertThat(stored.getStatus()).isEqualTo(DeploymentService.REQUESTED);
        assertThat(stored.getRequestedBy()).isEqualTo("ada");
        assertThat(stored.getRequestedAt()).isEqualTo(AT);
        assertThat(stored.getFinishedAt()).isNull();
        assertThat(stored.getReportedBy()).isNull();
        verify(repository).save(any(Deployment.class));
    }

    @Test
    void anOpenRequestHasNoYesSoItIsNotApproved() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.OPEN));

        assertThatThrownBy(() -> service.request("r-1", "production", null))
                .isInstanceOf(NotApproved.class)
                .hasMessageContaining(PullRequestService.OPEN);
        verify(repository, never()).save(any(Deployment.class));
    }

    @Test
    void aRejectedRequestHasAVerdictThatSaysNo() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.REJECTED));

        assertThatThrownBy(() -> service.request("r-1", "production", null))
                .isInstanceOf(NotApproved.class)
                .hasMessageContaining(PullRequestService.REJECTED);
        verify(repository, never()).save(any(Deployment.class));
    }

    @Test
    void anUnknownRequestIsNoSuchPullRequestBeforeAnythingIsStored() {
        when(requests.read("nope")).thenThrow(new NoSuchPullRequest("pull request \"nope\" does not exist"));

        assertThatThrownBy(() -> service.request("nope", "staging", null))
                .isInstanceOf(NoSuchPullRequest.class)
                .hasMessageContaining("nope");
        verifyNoInteractions(repository);
    }

    @Test
    void aBlankEnvironmentIsRefusedByName() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));

        assertThatThrownBy(() -> service.request("r-1", "   ", null))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("needs an environment");
    }

    @Test
    void anOffVocabularyEnvironmentIsRefusedWithBothWordsNamedAndNoCaseFolding() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));

        assertThatThrownBy(() -> service.request("r-1", "Production", null))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("staging")
                .hasMessageContaining("production")
                .hasMessageContaining("matched exactly");
    }

    @Test
    void aRequesterOverTheColumnWidthIsRefused() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        String tooLong = "a".repeat(DeploymentService.MAX_ACTOR + 1);

        assertThatThrownBy(() -> service.request("r-1", "staging", tooLong))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("at most " + DeploymentService.MAX_ACTOR);
    }

    @Test
    void aBlankRequesterBecomesNull() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        when(repository.save(any(Deployment.class))).thenAnswer(inv -> inv.getArgument(0));

        Deployment stored = service.request("r-1", "staging", "   ");

        assertThat(stored.getRequestedBy()).isNull();
    }

    // ── completing ────────────────────────────────────────────────────────────────────────────────

    @Test
    void aSuccessfulCompletionMovesThePatchToDeployed() {
        Deployment completed = new Deployment("d-1", "r-1", "p-1", DeploymentService.PRODUCTION,
                DeploymentService.SUCCEEDED, "ada", AT);
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")), Optional.of(completed));
        when(repository.completeIfRequested(any(), any(), any(), any(), any())).thenReturn(1);

        Deployment answer = service.complete("d-1", "succeeded", "  it is live  ", "  grace  ");

        assertThat(answer.getStatus()).isEqualTo(DeploymentService.SUCCEEDED);
        verify(patches).deploy("p-1");
        verify(repository).completeIfRequested(
                org.mockito.ArgumentMatchers.eq("d-1"),
                org.mockito.ArgumentMatchers.eq(DeploymentService.SUCCEEDED),
                org.mockito.ArgumentMatchers.eq(AT),
                org.mockito.ArgumentMatchers.eq("grace"),
                org.mockito.ArgumentMatchers.eq("it is live"));
    }

    @Test
    void aFailedCompletionLeavesTheApprovalStanding() {
        Deployment failed = new Deployment("d-1", "r-1", "p-1", DeploymentService.PRODUCTION,
                DeploymentService.FAILED, "ada", AT);
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")), Optional.of(failed));
        when(repository.completeIfRequested(any(), any(), any(), any(), any())).thenReturn(1);

        Deployment answer = service.complete("d-1", "failed", "the probe never went green", "grace");

        assertThat(answer.getStatus()).isEqualTo(DeploymentService.FAILED);
        verify(patches, never()).deploy(anyString());
    }

    @Test
    void aSecondReportIsAlreadyCompletedAndNothingMoves() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));
        when(repository.completeIfRequested(any(), any(), any(), any(), any())).thenReturn(0);

        assertThatThrownBy(() -> service.complete("d-1", "succeeded", null, null))
                .isInstanceOf(AlreadyCompleted.class)
                .hasMessageContaining("no longer requested");
        verify(patches, never()).deploy(anyString());
    }

    @Test
    void theCompletionGateIsTheUpdatesMovedRowsAndNeverACount() {
        Deployment completed = new Deployment("d-1", "r-1", "p-1", DeploymentService.STAGING,
                DeploymentService.SUCCEEDED, "ada", AT);
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")), Optional.of(completed));
        when(repository.completeIfRequested(any(), any(), any(), any(), any())).thenReturn(1);

        service.complete("d-1", "succeeded", null, null);

        verify(repository, never()).countByPullRequestId(anyString());
        verify(requests, never()).count(anyString());
    }

    @Test
    void aBlankCompletionStatusIsRefusedByName() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));

        assertThatThrownBy(() -> service.complete("d-1", "   ", null, null))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("needs a status");
        verify(repository, never()).completeIfRequested(any(), any(), any(), any(), any());
    }

    @Test
    void anOffVocabularyCompletionIsRefusedWithBothWordsNamed() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));

        assertThatThrownBy(() -> service.complete("d-1", "SUCCEEDED", null, null))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("succeeded")
                .hasMessageContaining("failed")
                .hasMessageContaining("matched exactly");
    }

    @Test
    void anOutcomeOverTheColumnWidthIsRefused() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));
        String tooLong = "a".repeat(DeploymentService.MAX_OUTCOME + 1);

        assertThatThrownBy(() -> service.complete("d-1", "failed", tooLong, null))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("at most " + DeploymentService.MAX_OUTCOME);
    }

    @Test
    void aReporterOverTheColumnWidthIsRefused() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));
        String tooLong = "a".repeat(DeploymentService.MAX_ACTOR + 1);

        assertThatThrownBy(() -> service.complete("d-1", "failed", null, tooLong))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("at most " + DeploymentService.MAX_ACTOR);
    }

    @Test
    void anUnknownDeploymentIsNoSuchDeploymentBeforeAnythingIsCompleted() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.complete("nope", "succeeded", null, null))
                .isInstanceOf(NoSuchDeployment.class)
                .hasMessageContaining("nope");
        verify(repository, never()).completeIfRequested(any(), any(), any(), any(), any());
    }

    // ── listing ───────────────────────────────────────────────────────────────────────────────────

    @Test
    void theListingIsScopedToTheRequestAndAsksForTheNewestFirst() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        when(repository.findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(requested("d-1")));

        List<Deployment> rows = service.list("r-1", 5, 0);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(
                org.mockito.ArgumentMatchers.eq("r-1"), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(5);
        assertThat(window.getValue().getOffset()).isZero();
        assertThat(rows).hasSize(1);
    }

    @Test
    void theCapAndTheFlooredOffsetAreTheSharedRuleRatherThanACopy() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        when(repository.findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(any(), any(Pageable.class)))
                .thenReturn(List.of());

        service.list("r-1", 500, -3);

        ArgumentCaptor<Pageable> window = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findByPullRequestIdOrderByRequestedAtDescDeploymentIdDesc(any(), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(100);
        assertThat(window.getValue().getOffset()).isZero();
    }

    @Test
    void theCountIsScopedToTheSameRequestAsTheWindow() {
        when(requests.read("r-1")).thenReturn(request("r-1", PullRequestService.APPROVED));
        when(repository.countByPullRequestId("r-1")).thenReturn(2L);

        assertThat(service.count("r-1")).isEqualTo(2L);
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
    void readingADeploymentAnswersWhatWasRecorded() {
        when(repository.findById("d-1")).thenReturn(Optional.of(requested("d-1")));

        Deployment read = service.read("d-1");

        assertThat(read.getPullRequestId()).isEqualTo("r-1");
        assertThat(read.getStatus()).isEqualTo(DeploymentService.REQUESTED);
    }

    @Test
    void readingAnIdThatNamesNothingIsNoSuchDeploymentAndTheMessageNamesIt() {
        when(repository.findById("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.read("nope"))
                .isInstanceOf(NoSuchDeployment.class)
                .hasMessageContaining("nope")
                .hasMessageContaining("does not exist");
    }

    @Test
    void readingABlankIdIsRefusedBeforeTheTableIsAsked() {
        assertThatThrownBy(() -> service.read("   "))
                .isInstanceOf(InvalidDeployment.class)
                .hasMessageContaining("id is required");
        verifyNoInteractions(repository);
    }
}
