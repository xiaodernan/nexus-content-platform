package dev.nexus.api.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.ops.AuditController.Entry;
import dev.nexus.api.ops.AuditController.Trail;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M7 v428 - the OBSERVABILITY door's HTTP surface, graded directly.
 *
 * <p>The trail door is the one door whose controller had never been asked its own questions: what the
 * trail HOLDS is the service's subject (AuditServiceTest), and what the browser does with it is the ops
 * panel's, but the WIRE is decided here. What this controller owns: the ask carries the RAW cap and the
 * RAW action (the clamping and the narrowing are the service's, in the query), the offset is clamped to
 * the first window HERE, and the answer echoes the CLAMPED cap beside the window it carried and the WHOLE
 * trail's size - so \u201cthe 3 rows you got\u201d and \u201cthe 57 that exist\u201d are different numbers a
 * caller can tell apart without keeping its own bookkeeping. One entry crosses as the client's own shape
 * with the instant in epoch MILLISECONDS and the actor's assurance beside it, and NO handle: the trail
 * records what a claim was worth, not what it called itself.
 *
 * <p>No Spring context and no database here on purpose, the same rule the seven controller tests before
 * this one follow.
 */
@ExtendWith(MockitoExtension.class)
class AuditControllerTest {

    private static final Instant AT = Instant.parse("2026-10-23T09:00:00Z");

    @Mock
    private AuditService service;

    private AuditController controller;

    @BeforeEach
    void setUp() {
        controller = new AuditController(service);
    }

    /**
     * One stored entry as the repository hands it back. The entity is mocked because the id is GENERATED:
     * the public constructor names everything an entry says except the id the database gives it, so the
     * mapping rule under test (a Long becomes a String) is the only thing stubbing the getter decides.
     */
    private static AuditEntry row(Long id, String action, String actorId, String assurance) {
        AuditEntry row = mock(AuditEntry.class);
        when(row.getId()).thenReturn(id);
        when(row.getAction()).thenReturn(action);
        when(row.getActorAccountId()).thenReturn(actorId);
        when(row.getTargetId()).thenReturn("pub-1");
        when(row.getTargetType()).thenReturn(AuditService.TARGET_PUBLICATION);
        when(row.getOccurredAt()).thenReturn(AT);
        when(row.getActorAssurance()).thenReturn(assurance);
        return row;
    }

    @Test
    void theDefaultWindowAsksTheServicesOwnCapFromOffsetZero() {
        AuditEntry entry = row(41L, "publish", "acct-ada", "unsigned-local");
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, null)).thenReturn(List.of(entry));
        when(service.count()).thenReturn(57L);

        ResponseEntity<Trail> res = controller.list(null, null, null);

        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody().count()).isEqualTo(1);
        assertThat(res.getBody().limit()).isEqualTo(AuditService.DEFAULT_LIST_LIMIT);
        assertThat(res.getBody().total()).isEqualTo(57L);
        verify(service).list(AuditService.DEFAULT_LIST_LIMIT, 0, null);
    }

    @Test
    void theAskCarriesTheRawCapWhileTheAnswerEchoesTheClampedOne() {
        // The ask is RAW: the cap that gets applied is the service's decision, in the query. The echo is
        // CLAMPED: the answer says which cap was actually in force, so a reader is not told \u201c20\u201d about
        // a window the service cut at 100.
        when(service.list(500, 0, null)).thenReturn(List.of());
        when(service.count()).thenReturn(57L);

        ResponseEntity<Trail> res = controller.list(500, null, null);

        verify(service).list(500, 0, null);
        assertThat(res.getBody().limit()).isEqualTo(AuditService.MAX_LIST_LIMIT);
    }

    @Test
    void aNonPositiveLimitAsksRawAndEchoesTheFloor() {
        when(service.list(0, 0, null)).thenReturn(List.of());
        when(service.list(-5, 0, null)).thenReturn(List.of());
        when(service.count()).thenReturn(0L);

        assertThat(controller.list(0, null, null).getBody().limit()).isEqualTo(1);
        assertThat(controller.list(-5, null, null).getBody().limit()).isEqualTo(1);
    }

    @Test
    void aNegativeOffsetIsClampedToTheFirstWindowInTheAsk() {
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, null)).thenReturn(List.of());
        when(service.count()).thenReturn(0L);

        controller.list(null, -3, null);

        verify(service).list(AuditService.DEFAULT_LIST_LIMIT, 0, null);
    }

    @Test
    void aDeepWindowTravelsWhole() {
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 100, null)).thenReturn(List.of());
        when(service.count()).thenReturn(57L);

        controller.list(null, 100, null);

        verify(service).list(AuditService.DEFAULT_LIST_LIMIT, 100, null);
    }

    @Test
    void theActionTravelsRawBecauseTheSetIsTheServices() {
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, "publish")).thenReturn(List.of());
        when(service.count()).thenReturn(57L);

        controller.list(null, null, "publish");

        verify(service).list(AuditService.DEFAULT_LIST_LIMIT, 0, "publish");
    }

    @Test
    void oneEntryCrossesAsTheClientsOwnShapeWithTheInstantInEpochMillis() {
        AuditEntry entry = row(41L, "publish", "acct-ada", "unsigned-local");
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, null)).thenReturn(List.of(entry));
        when(service.count()).thenReturn(57L);

        Entry e = controller.list(null, null, null).getBody().entries().get(0);

        assertThat(e.id()).isEqualTo("41");
        assertThat(e.action()).isEqualTo("publish");
        assertThat(e.actorId()).isEqualTo("acct-ada");
        assertThat(e.targetId()).isEqualTo("pub-1");
        assertThat(e.targetType()).isEqualTo(AuditService.TARGET_PUBLICATION);
        assertThat(e.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(e.assurance()).isEqualTo("unsigned-local");
        // The wire shape is graded field by field: the stored actor HANDLE is not one of them, so the
        // trail can never carry what a claim called itself - only what it was worth.
        assertThat(Entry.class.getRecordComponents())
                .extracting(RecordComponent::getName)
                .containsExactly("id", "action", "actorId", "targetId", "targetType", "createdAt", "assurance");
    }

    @Test
    void anAnonymousEntryTravelsWithNullsRatherThanInventedOnes() {
        AuditEntry anonymous = row(7L, "publish", null, null);
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, null)).thenReturn(List.of(anonymous));
        when(service.count()).thenReturn(57L);

        Entry e = controller.list(null, null, null).getBody().entries().get(0);

        assertThat(e.actorId()).isNull();
        assertThat(e.assurance()).isNull();
        assertThat(e.action()).isEqualTo("publish"); // the event is real; only the actor is absent
    }

    @Test
    void countIsTheWindowTheAnswerCarriedAndTotalIsTheWholeTrail() {
        AuditEntry named = row(9L, "report", "acct-ada", "unsigned-local");
        AuditEntry anonymous = row(8L, "report", null, null);
        when(service.list(AuditService.DEFAULT_LIST_LIMIT, 0, "report")).thenReturn(List.of(named, anonymous));
        when(service.count()).thenReturn(57L);

        Trail body = controller.list(null, null, "report").getBody();

        assertThat(body.count()).isEqualTo(2); // the window this answer carried
        assertThat(body.total()).isEqualTo(57L); // the whole trail, narrowed or not
    }

    @Test
    void aFilterTheServiceDoesNotKnowIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(
                new IllegalArgumentException("a trail can be narrowed to one of publish, unpublish - not \"explode\""));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-audit-filter")
                .containsEntry("message", "a trail can be narrowed to one of publish, unpublish - not \"explode\"");
    }
}
