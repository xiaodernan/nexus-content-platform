package dev.nexus.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.moderation.ModerationDtos.DeskEntry;
import dev.nexus.api.ops.AuditService;
import dev.nexus.api.publish.PublishedProject;
import dev.nexus.api.publish.PublishedProjectRepository;
import dev.nexus.api.social.ReportDtos;
import dev.nexus.api.social.ReportEntry;
import dev.nexus.api.social.ReportRepository;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/**
 * The desk's rules: whose desk it is, what it shows, and who may dispose of a report.
 *
 * <p>No Spring context and no database here on purpose — these cases are about what the service decides.
 */
@ExtendWith(MockitoExtension.class)
class ModerationServiceTest {

    private static final Instant AT = Instant.parse("2026-10-21T09:00:00Z");

    @Mock
    private ReportRepository reports;

    @Mock
    private PublishedProjectRepository publications;

    @Mock
    private AuditService audit;

    private ModerationService service;

    @BeforeEach
    void setUp() {
        service = new ModerationService(reports, publications, audit);
    }

    /**
     * A publication, stubbed with what the DESK reads: the id and the title.
     *
     * <p>The ownership stub is NOT here: the desk never asks whether the caller owns the work (the finder
     * already answered "the owner's own publications"), and a stub nothing reads is a stub Mockito rightly
     * complains about.
     */
    private static PublishedProject owned(String projectId, String title) {
        PublishedProject publication = org.mockito.Mockito.mock(PublishedProject.class);
        when(publication.getProjectId()).thenReturn(projectId);
        when(publication.getTitle()).thenReturn(title);
        return publication;
    }

    private static ReportEntry report(String reportId, String target, String status) {
        return new ReportEntry(
                reportId,
                target,
                "acct-reporter",
                "reporter",
                "unsigned-local",
                "spam",
                "the words the reporter wrote",
                status,
                AT);
    }

    // ── the desk: whose it is ────────────────────────────────────────────────────────────────────

    @Test
    void theDeskListsTheReportsAgainstTheOwnersOwnPublications() {
        // The publication is stubbed FIRST: a stub built inside another stub's argument is unfinished
        // stubbing, and Mockito is right to refuse it.
        PublishedProject publication = owned("pub-1", "My First World");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInOrderByCreatedAtDesc(eq(List.of("pub-1")), any(Pageable.class)))
                .thenReturn(List.of(report("rep-1", "pub-1", ReportDtos.STATUS_OPEN)));

        List<DeskEntry> desk = service.deskOf("acct-ada", 20);

        assertThat(desk).hasSize(1);
        assertThat(desk.get(0).reportId()).isEqualTo("rep-1");
        assertThat(desk.get(0).targetProjectId()).isEqualTo("pub-1");
        assertThat(desk.get(0).targetTitle()).isEqualTo("My First World");
        assertThat(desk.get(0).reason()).isEqualTo("spam");
        assertThat(desk.get(0).detail()).isEqualTo("the words the reporter wrote");
        assertThat(desk.get(0).status()).isEqualTo(ReportDtos.STATUS_OPEN);
        assertThat(desk.get(0).createdAt()).isEqualTo(AT.toEpochMilli());
    }

    @Test
    void theDeskDoesNotNameTheReporterAndCannotBeMadeTo() {
        // The identity is the load-bearing omission: a claim is not a key, and a name cannot be un-said.
        // The WIRE has no field that could carry it, so this cannot be widened later by accident.
        List<String> fields = Arrays.stream(DeskEntry.class.getRecordComponents())
                .map(RecordComponent::getName)
                .toList();
        assertThat(fields).doesNotContain("reporterId", "reporterHandle", "reporterAccountId", "reporter");
        assertThat(fields).contains("reason", "detail", "status");
    }

    @Test
    void anAccountWithNoPublicationsHasAnEmptyDesk() {
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());
        assertThat(service.deskOf("acct-ada", 20)).isEmpty();
        verify(reports, never()).findByTargetProjectIdInOrderByCreatedAtDesc(any(), any());
    }

    @Test
    void theDeskRefusesACallerThatNamesNoAccount() {
        assertThatThrownBy(() -> service.deskOf(null, 20))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("belongs to an account");
        assertThatThrownBy(() -> service.deskOf("   ", 20))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("belongs to an account");
    }

    @Test
    void theDeskIsCappedAndTheCapIsCLAMPED() {
        PublishedProject publication = owned("pub-1", "My First World");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInOrderByCreatedAtDesc(any(), any(Pageable.class))).thenReturn(List.of());

        service.deskOf("acct-ada", 10_000);

        org.mockito.ArgumentCaptor<Pageable> window = org.mockito.ArgumentCaptor.forClass(Pageable.class);
        verify(reports).findByTargetProjectIdInOrderByCreatedAtDesc(any(), window.capture());
        assertThat(window.getValue().getPageSize()).isEqualTo(ModerationService.MAX_DESK_LIMIT);
    }

    // ── the disposition: who may dispose, and what it says ───────────────────────────────────────

    @Test
    void theOwnerMayAcknowledgeAReportAndTheRowSTAYS() {
        when(reports.findByReportId("rep-1")).thenReturn(Optional.of(report("rep-1", "pub-1", ReportDtos.STATUS_OPEN)));
        PublishedProject publication = org.mockito.Mockito.mock(PublishedProject.class);
        when(publication.isOwnedBy("acct-ada")).thenReturn(true);
        when(publications.findById("pub-1")).thenReturn(Optional.of(publication));

        ModerationDtos.DispositionAnswer answer = service.acknowledge("rep-1", "acct-ada");

        assertThat(answer.moved()).isTrue();
        assertThat(answer.status()).isEqualTo(ReportDtos.STATUS_ACKNOWLEDGED);
        verify(reports).save(any(ReportEntry.class));
        // and the fact that it happened is in the trail
        verify(audit).record("acknowledge", "acct-ada", null, null, "pub-1");
    }

    @Test
    void acknowledgingSomebodyElsesPublicationIsREFUSED() {
        when(reports.findByReportId("rep-1")).thenReturn(Optional.of(report("rep-1", "pub-1", ReportDtos.STATUS_OPEN)));
        PublishedProject publication = org.mockito.Mockito.mock(PublishedProject.class);
        when(publication.isOwnedBy("acct-ada")).thenReturn(false);
        when(publications.findById("pub-1")).thenReturn(Optional.of(publication));

        assertThatThrownBy(() -> service.acknowledge("rep-1", "acct-ada"))
                .isInstanceOf(NotYourPublication.class)
                .hasMessageContaining("does not own");
        verify(reports, never()).save(any(ReportEntry.class));
        verify(audit, never()).record(anyString(), any(), any(), any(), any());
    }

    @Test
    void acknowledgingAReportAboutAPublicationThatIsGONEIsREFUSED() {
        // The publication was taken down: there is no owner left to acknowledge anything, and the service
        // says so rather than inventing one.
        when(reports.findByReportId("rep-1")).thenReturn(Optional.of(report("rep-1", "pub-gone", ReportDtos.STATUS_OPEN)));
        when(publications.findById("pub-gone")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.acknowledge("rep-1", "acct-ada"))
                .isInstanceOf(NotYourPublication.class)
                .hasMessageContaining("does not own");
    }

    @Test
    void aReportThatIsAlreadyDisposedOfSaysItDidNotMove() {
        when(reports.findByReportId("rep-1")).thenReturn(Optional.of(report("rep-1", "pub-1", ReportDtos.STATUS_REJECTED)));
        PublishedProject publication = org.mockito.Mockito.mock(PublishedProject.class);
        when(publication.isOwnedBy("acct-ada")).thenReturn(true);
        when(publications.findById("pub-1")).thenReturn(Optional.of(publication));

        ModerationDtos.DispositionAnswer answer = service.acknowledge("rep-1", "acct-ada");

        assertThat(answer.moved()).isFalse();
        assertThat(answer.status()).isEqualTo(ReportDtos.STATUS_REJECTED);
        verify(reports, never()).save(any(ReportEntry.class));
    }

    @Test
    void acknowledgingAnUnknownReportIsREFUSEDByName() {
        when(reports.findByReportId("rep-nope")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.acknowledge("rep-nope", "acct-ada"))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("no report carries the id");
    }

    @Test
    void acknowledgingWithNoReportIdIsREFUSEDByName() {
        assertThatThrownBy(() -> service.acknowledge("  ", "acct-ada"))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("reportId must not be blank");
    }

    @Test
    void theAcknowledgementIsNotAModeratorsVerdict() {
        // The statuses a moderator would use are DECLARED and UNREACHABLE in this build, and the one the
        // owner can reach is named for what it is.
        assertThat(ReportDtos.STATUS_ACKNOWLEDGED).isEqualTo("acknowledged");
        assertThat(ReportDtos.STATUS_ACKNOWLEDGED)
                .isNotEqualTo(ReportDtos.STATUS_REVIEWED)
                .isNotEqualTo(ReportDtos.STATUS_RESOLVED);
    }
}
