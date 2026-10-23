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

    /**
     * A publication, stubbed with what the TALLY reads: the id alone.
     *
     * <p>The title is not stubbed here, because the tally never asks for it — and a stub nothing reads is a
     * stub Mockito rightly complains about.
     */
    private static PublishedProject ownedId(String projectId) {
        PublishedProject publication = org.mockito.Mockito.mock(PublishedProject.class);
        when(publication.getProjectId()).thenReturn(projectId);
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
                ReportDtos.PERIOD_MONTH,
                AuditService.TARGET_PUBLICATION,
                AT);
    }

    // ── the desk: whose it is ────────────────────────────────────────────────────────────────────

    @Test
    void theDeskListsTheReportsAgainstTheOwnersOwnPublications() {
        // The publication is stubbed FIRST: a stub built inside another stub's argument is unfinished
        // stubbing, and Mockito is right to refuse it. The desk reads the TITLE (it names the publication
        // beside the report), so this case uses the fuller helper.
        PublishedProject publication = owned("pub-1", "My First World");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInOrderByCreatedAtDesc(eq(List.of("pub-1")), any(Pageable.class)))
                .thenReturn(List.of(report("rep-1", "pub-1", ReportDtos.STATUS_OPEN)));

        List<DeskEntry> desk = service.deskOf("acct-ada", 20, null);

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
        assertThat(service.deskOf("acct-ada", 20, null)).isEmpty();
        verify(reports, never()).findByTargetProjectIdInOrderByCreatedAtDesc(any(), any());
    }

    // ── v326: the desk can be narrowed to ONE reason, and the narrowing is the service's ───────────

    @Test
    void theDeskCanBeNarrowedToOneReason() {
        // The publication is built FIRST, outside the stub: a stub built inside another stub's
        // argument is unfinished stubbing, and Mockito is right to refuse it (the house's own rule).
        PublishedProject publication = owned("pub-1", "My First World");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInAndReasonOrderByCreatedAtDesc(
                any(), eq("spam"), any(Pageable.class)))
                .thenReturn(List.of(report("rep-1", "pub-1", "open")));

        List<DeskEntry> rows = service.deskOf("acct-ada", 20, "spam");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).reason()).isEqualTo("spam");
        verify(reports).findByTargetProjectIdInAndReasonOrderByCreatedAtDesc(any(), eq("spam"), any(Pageable.class));
    }

    @Test
    void aReasonThisBuildDoesNotKnowIsREFUSEDByName() {
        // A caller that asked for a reason this service does not have, and was answered with the whole
        // desk, would read the answer as "there was nothing of that reason" — a different fact.
        assertThatThrownBy(() -> service.deskOf("acct-ada", 20, "rude"))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("one of spam, harassment, illegal, other");
    }

    @Test
    void aBlankReasonIsNOReason() {
        // The publication is built FIRST, outside the stub: a stub built inside another stub's
        // argument is unfinished stubbing, and Mockito is right to refuse it (the house's own rule).
        PublishedProject publication = owned("pub-1", "My First World");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInOrderByCreatedAtDesc(any(), any(Pageable.class)))
                .thenReturn(List.of(report("rep-1", "pub-1", "open")));

        List<DeskEntry> rows = service.deskOf("acct-ada", 20, "  ");

        assertThat(rows).hasSize(1);
        verify(reports).findByTargetProjectIdInOrderByCreatedAtDesc(any(), any(Pageable.class));
    }

    @Test
    void theDeskRefusesACallerThatNamesNoAccount() {
        assertThatThrownBy(() -> service.deskOf(null, 20, null))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("belongs to an account");
        assertThatThrownBy(() -> service.deskOf("   ", 20, null))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("belongs to an account");
    }

    @Test
    void theDeskIsCappedAndTheCapIsCLAMPED() {
        PublishedProject publication = ownedId("pub-1");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        when(reports.findByTargetProjectIdInOrderByCreatedAtDesc(any(), any(Pageable.class))).thenReturn(List.of());

        service.deskOf("acct-ada", 10_000, null);

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
        verify(audit).record("acknowledge", "acct-ada", null, null, "pub-1", AuditService.TARGET_PUBLICATION);
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
        verify(audit, never()).record(anyString(), any(), any(), any(), any(), any());
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

    // ── v312: the TALLY — how many reports, by reason and by status ──────────────────────────────────

    @Test
    void theTallyCountsByReasonAndByStatus() {
        PublishedProject publication = ownedId("pub-1");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        // The GROUPED query's rows are (reason, status, count).
        List<Object[]> grouped = List.of(
                new Object[] {"spam", ReportDtos.STATUS_OPEN, 2L},
                new Object[] {"harassment", ReportDtos.STATUS_OPEN, 1L},
                new Object[] {"spam", ReportDtos.STATUS_ACKNOWLEDGED, 1L});
        when(reports.countByTargetsGroupedByReasonAndStatus(eq(List.of("pub-1")))).thenReturn(grouped);

        ModerationDtos.TallyAnswer tally = service.tallyOf("acct-ada");

        assertThat(tally.total()).isEqualTo(4L);
        assertThat(tally.open()).isEqualTo(3L);
        // The maps are MARGINAL totals: every spam report counts as spam, whatever became of it, and the
        // status map counts the same four reports the other way. The CROSS (how many of the spam ones are
        // still open) is not in the answer — and the open count beside it is what a creator acts on.
        assertThat(tally.byReason()).containsEntry("spam", 3L).containsEntry("harassment", 1L);
        assertThat(tally.byStatus()).containsEntry(ReportDtos.STATUS_OPEN, 3L).containsEntry(ReportDtos.STATUS_ACKNOWLEDGED, 1L);
    }

    @Test
    void theTallyCountsEVERYReportAndNotTheDeskWindow() {
        // The desk shows the most recent hundred; the tally counts every report against the work. A tally
        // computed from the window would say "3 reports" when there are thirty — and the number that is
        // wrong is the one a creator acts on.
        PublishedProject publication = ownedId("pub-1");
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of(publication));
        List<Object[]> grouped = List.<Object[]>of(new Object[] {"spam", ReportDtos.STATUS_OPEN, 30L});
        when(reports.countByTargetsGroupedByReasonAndStatus(eq(List.of("pub-1")))).thenReturn(grouped);

        ModerationDtos.TallyAnswer tally = service.tallyOf("acct-ada");

        assertThat(tally.total()).isEqualTo(30L);
        assertThat(tally.open()).isEqualTo(30L);
    }

    @Test
    void anAccountWithNoPublicationsHasAnEmptyTally() {
        when(publications.findByOwnerAccountIdOrderByPublishedAtDesc(eq("acct-ada"), any(Pageable.class)))
                .thenReturn(List.of());

        ModerationDtos.TallyAnswer tally = service.tallyOf("acct-ada");

        assertThat(tally.total()).isZero();
        assertThat(tally.open()).isZero();
        assertThat(tally.byReason()).isEmpty();
    }

    @Test
    void theTallyRefusesACallerThatNamesNoAccount() {
        assertThatThrownBy(() -> service.tallyOf("  "))
                .isInstanceOf(InvalidModeration.class)
                .hasMessageContaining("belongs to an account");
    }
}
