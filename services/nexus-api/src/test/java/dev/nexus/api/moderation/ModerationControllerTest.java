package dev.nexus.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.moderation.ModerationDtos.DeskAnswer;
import dev.nexus.api.moderation.ModerationDtos.DeskEntry;
import dev.nexus.api.moderation.ModerationDtos.DispositionAnswer;
import dev.nexus.api.moderation.ModerationDtos.TallyAnswer;
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
 * M7 v427 - the HTTP surface for the OWNER'S DESK, graded directly.
 *
 * <p>Two doors - read the desk, acknowledge a report on it - plus the tally door that is deliberately its
 * OWN door rather than a field on the desk, because the desk is a window and the tally counts every
 * report: a number computed from a window would be wrong in exactly the direction a creator acts on. What
 * THIS file grades is what the controller decides on its own: the ask carries the RAW cap with the offset
 * clamped, the reason travels RAW because the narrowing is the service's (in the query), and the echoed
 * owner is TRIMMED while the ask is not. The tally and the acknowledge answers pass through untouched -
 * the controller adds nothing to a number that must not be recomputed.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests and the six
 * controller tests before this one follow.
 */
@ExtendWith(MockitoExtension.class)
class ModerationControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private ModerationService service;

    private ModerationController controller;

    @BeforeEach
    void setUp() {
        controller = new ModerationController(service);
    }

    private static DeskEntry row(String reportId, String status) {
        return new DeskEntry(reportId, "pub-1", "Harbour", "spam", "it is an ad", status, AT.toEpochMilli());
    }

    @Test
    void theDeskAsksWithTheRawCapAndTheClampedOffsetAndTrimsTheEchoedOwner() {
        when(service.deskOf("  acct-a  ", 500, 0, "spam")).thenReturn(List.of(row("rep-1", "open")));

        ResponseEntity<DeskAnswer> res = controller.desk("  acct-a  ", 500, -3, "spam");

        // The cap travels raw (the service's own clamp is the one clamp) and the offset is clamped to the
        // first window; the ANSWER trims the owner the ASK did not.
        verify(service).deskOf("  acct-a  ", 500, 0, "spam");
        DeskAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.ownerAccountId()).isEqualTo("acct-a");
        assertThat(answer.reports()).hasSize(1);
        // The echo is the cap the caller ASKED for, not the one the service applied - the window's own
        // cap is the service's answer to carry.
        assertThat(answer.limit()).isEqualTo(500);
    }

    @Test
    void theDeskDefaultsTheCapAndTheOffsetWhenTheyAreAbsent() {
        when(service.deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 0, null)).thenReturn(List.of());

        ResponseEntity<DeskAnswer> res = controller.desk("acct-a", null, null, null);

        verify(service).deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 0, null);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().limit()).isEqualTo(ModerationService.DEFAULT_DESK_LIMIT);
    }

    @Test
    void theReasonTravelsRawBecauseTheNarrowingIsTheServices() {
        when(service.deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 0, "  spam  ")).thenReturn(List.of());

        controller.desk("acct-a", null, null, "  spam  ");

        // The narrowing happens IN THE QUERY, so the controller does not read, trim or interpret the
        // reason: it carries exactly what the caller typed. (The Studio's own lane trims before its ask;
        // this door is the service side, and the two spellings are both pinned where they live.)
        verify(service).deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 0, "  spam  ");
    }

    @Test
    void aDeepWindowTravelsWhole() {
        when(service.deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 60, null)).thenReturn(List.of());

        controller.desk("acct-a", null, 60, null);

        verify(service).deskOf("acct-a", ModerationService.DEFAULT_DESK_LIMIT, 60, null);
    }

    @Test
    void aNullOwnerAnswersANullEchoRatherThanCrashing() {
        when(service.deskOf(null, ModerationService.DEFAULT_DESK_LIMIT, 0, null)).thenReturn(List.of());

        ResponseEntity<DeskAnswer> res = controller.desk(null, null, null, null);

        // The parameter is required by Spring, so this is the guard's own case: a null owner is asked as
        // null and echoed as null, not turned into the string "null" by a trim.
        verify(service).deskOf(null, ModerationService.DEFAULT_DESK_LIMIT, 0, null);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().ownerAccountId()).isNull();
    }

    @Test
    void theTallyIsPassedThroughUntouched() {
        TallyAnswer tally = new TallyAnswer("acct-a", 30L, 12L, Map.of("spam", 25L, "abuse", 5L), Map.of("open", 12L, "resolved", 18L));
        when(service.tallyOf("acct-a")).thenReturn(tally);

        ResponseEntity<TallyAnswer> res = controller.tally("acct-a");

        // The tally is a door of its own, and the controller adds nothing: the number a creator acts on
        // is not recomputed on the way out.
        verify(service).tallyOf("acct-a");
        assertThat(res.getBody()).isSameAs(tally);
    }

    @Test
    void theAcknowledgeIsPassedThroughAndAnswers200EitherWay() {
        when(service.acknowledge("rep-1", "acct-a")).thenReturn(new DispositionAnswer("rep-1", "resolved", true));

        ResponseEntity<DispositionAnswer> moved = controller.acknowledge("rep-1", "acct-a");

        // 200 either way: a report that was already disposed of is "already disposed of", not an error,
        // and the answer says whether the status MOVED so a caller is never told it moved when it did not.
        assertThat(moved.getStatusCode().value()).isEqualTo(200);
        assertThat(moved.getBody()).isEqualTo(new DispositionAnswer("rep-1", "resolved", true));

        when(service.acknowledge("rep-2", "acct-a")).thenReturn(new DispositionAnswer("rep-2", "resolved", false));
        ResponseEntity<DispositionAnswer> still = controller.acknowledge("rep-2", "acct-a");

        assertThat(still.getStatusCode().value()).isEqualTo(200);
        assertThat(still.getBody()).isEqualTo(new DispositionAnswer("rep-2", "resolved", false));
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidModeration("a desk question names whose desk it is"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-moderation")
                .containsEntry("message", "a desk question names whose desk it is");
    }

    @Test
    void somebodyElsesPublicationIsA403NotA400() {
        // The request was well-formed, so a 400 would tell the caller to fix a field that is fine.
        ResponseEntity<Map<String, String>> res = controller.notYours(new NotYourPublication("that publication is not yours"));

        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody())
                .containsEntry("error", "not-your-publication")
                .containsEntry("message", "that publication is not yours");
    }
}
