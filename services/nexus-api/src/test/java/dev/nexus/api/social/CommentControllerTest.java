package dev.nexus.api.social;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.social.CommentDtos.Comment;
import dev.nexus.api.social.CommentDtos.CommentAnswer;
import dev.nexus.api.social.CommentDtos.CommentClaim;
import dev.nexus.api.social.CommentDtos.CommentRequest;
import dev.nexus.api.social.CommentDtos.ThreadAnswer;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M7 v418 - the HTTP surface for COMMENTS, graded directly.
 *
 * <p>The controller owns only HTTP: every rule lives in {@link CommentService}, and the refusals are
 * translated here into the status codes that carry the difference - 400 for a request that broke a rule,
 * 403 for a request that was understood and refused. What THIS file grades is that translation and the
 * three things the controller decides on its own: the window arithmetic before the ask (a cap over the
 * max is the max, a non-positive cap is the default, a negative offset is the first window), the shape
 * of each direction's answer (the thread direction carries the window it answered; the author direction
 * carries no window at all), and the claim a DELETE builds out of a query parameter - the account id and
 * nothing else.
 *
 * <p>No Spring context and no database here on purpose, the same rule the service tests follow: these
 * cases are about what the controller decides. The wiring (that {@code @RequestBody} binds a JSON body,
 * that {@code @ExceptionHandler} maps a thrown refusal to the status) is Spring's, and it is graded by
 * the contract proofs that drive the real jar.
 */
@ExtendWith(MockitoExtension.class)
class CommentControllerTest {

    private static final Instant AT = Instant.parse("2026-10-20T12:00:00Z");

    @Mock
    private CommentService service;

    private CommentController controller;

    @BeforeEach
    void setUp() {
        controller = new CommentController(service);
    }

    private static CommentClaim claim(String accountId) {
        return new CommentClaim(accountId, "ada", "unsigned-local", 1_700_000_000_000L);
    }

    private static CommentEntry row(String id, String account, boolean deleted) {
        CommentEntry entry = new CommentEntry(id, "pub-1", account, "ada", "unsigned-local", "nice work", AT);
        if (deleted) {
            entry.markDeleted();
        }
        return entry;
    }

    @Test
    void aWrittenCommentAnswers201WithTheRowTheCountAndTheDefaultCap() {
        when(service.comment("pub-1", claim("acct-ada"), "nice work")).thenReturn(row("cmt-1", "acct-ada", false));

        ResponseEntity<CommentAnswer> res = controller.comment(
                new CommentRequest("pub-1", claim("acct-ada"), "nice work"));

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        CommentAnswer answer = res.getBody();
        assertThat(answer).isNotNull();
        assertThat(answer.projectId()).isEqualTo("pub-1");
        assertThat(answer.comments()).hasSize(1);
        Comment wire = answer.comments().get(0);
        assertThat(wire.id()).isEqualTo("cmt-1");
        assertThat(wire.accountId()).isEqualTo("acct-ada");
        assertThat(wire.createdAt()).isEqualTo(AT.toEpochMilli());
        assertThat(wire.deleted()).isFalse();
        assertThat(wire.handle()).isEqualTo("ada");
        assertThat(wire.assurance()).isEqualTo("unsigned-local");
        assertThat(answer.visible()).isEqualTo(1L);
        assertThat(answer.limit()).isEqualTo(CommentService.DEFAULT_COMMENT_LIMIT);
    }

    @Test
    void aNullRequestBodyIsAskedAsNullsRatherThanThrownIntoA500() {
        // The controller's null-guard means the SERVICE decides what a null body means (and refuses it
        // by name); the controller itself never turns a malformed POST into an unmapped 500.
        when(service.comment(null, null, null)).thenReturn(row("cmt-1", "acct-ada", false));

        controller.comment(null);

        verify(service).comment(null, null, null);
    }

    @Test
    void theDeleteClaimCarriesOnlyTheAccountIdTheQueryParameterNamed() {
        when(service.delete("cmt-1", new CommentClaim("acct-ada", null, null, null))).thenReturn(true);

        ResponseEntity<Map<String, Object>> res = controller.delete("cmt-1", "acct-ada");

        ArgumentCaptor<CommentClaim> captor = ArgumentCaptor.forClass(CommentClaim.class);
        verify(service).delete(org.mockito.ArgumentMatchers.eq("cmt-1"), captor.capture());
        CommentClaim asked = captor.getValue();
        assertThat(asked.accountId()).isEqualTo("acct-ada");
        // The query parameter names ONE thing; the handle, the assurance and the instant are not in a
        // URL, so they travel null and the service reads what it was actually given.
        assertThat(asked.handle()).isNull();
        assertThat(asked.assurance()).isNull();
        assertThat(asked.claimedAt()).isNull();
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).containsEntry("removed", true);
    }

    @Test
    void aDeleteWithNoClaimerAsksTheServiceWithNoClaim() {
        when(service.delete("cmt-1", null)).thenReturn(false);

        ResponseEntity<Map<String, Object>> res = controller.delete("cmt-1", null);

        verify(service).delete("cmt-1", null);
        assertThat(res.getBody()).containsEntry("removed", false);
    }

    @Test
    void anAlreadyGoneCommentAnswers200WithRemovedFalse() {
        // 200 either way: a comment that is already gone is "already gone", not an error, because the
        // URL names a comment rather than a resource that must exist.
        when(service.delete("cmt-1", new CommentClaim("acct-ada", null, null, null))).thenReturn(false);

        ResponseEntity<Map<String, Object>> res = controller.delete("cmt-1", "acct-ada");

        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody())
                .containsEntry("ok", true)
                .containsEntry("commentId", "cmt-1")
                .containsEntry("removed", false);
    }

    @Test
    void theThreadDirectionClampsTheCapAndTheWindowBeforeAsking() {
        when(service.commentsOf("pub-1", CommentService.MAX_COMMENT_LIMIT, 0))
                .thenReturn(new CommentService.CommentResult("pub-1", List.of(), 0L, 0L, 0L));

        controller.list("pub-1", null, 500, -3);

        // A cap over the max is the max; a negative offset is the first window. Both clamped HERE, so
        // the answer can echo exactly what was answered.
        verify(service).commentsOf("pub-1", CommentService.MAX_COMMENT_LIMIT, 0);
    }

    @Test
    void aNonPositiveCapIsTheDefaultNotARefusal() {
        when(service.commentsOf("pub-1", CommentService.DEFAULT_COMMENT_LIMIT, 0))
                .thenReturn(new CommentService.CommentResult("pub-1", List.of(), 0L, 0L, 0L));

        controller.list("pub-1", null, 0, 0);

        verify(service).commentsOf("pub-1", CommentService.DEFAULT_COMMENT_LIMIT, 0);
    }

    @Test
    void theThreadAnswerCarriesTheWindowItAnswered() {
        when(service.commentsOf("pub-1", CommentService.DEFAULT_COMMENT_LIMIT, 0)).thenReturn(
                new CommentService.CommentResult("pub-1", List.of(row("cmt-1", "acct-ada", false)), 5L, 4L, 9L));

        ResponseEntity<?> res = controller.list("pub-1", null, null, null);

        assertThat(res.getBody()).isInstanceOf(ThreadAnswer.class);
        ThreadAnswer answer = (ThreadAnswer) res.getBody();
        assertThat(answer.limit()).isEqualTo(CommentService.DEFAULT_COMMENT_LIMIT);
        assertThat(answer.offset()).isZero();
        // total is the ROW count (the removed ones included) - that is what a pager pages by.
        assertThat(answer.total()).isEqualTo(9L);
        assertThat(answer.visible()).isEqualTo(5L);
        assertThat(answer.comments()).hasSize(1);
    }

    @Test
    void theAuthorDirectionAsksWithTheRawCapAndCountsTheVisibleOnes() {
        when(service.commentsWritten("acct-ada", 500))
                .thenReturn(List.of(row("cmt-1", "acct-ada", false), row("cmt-2", "acct-ada", true)));

        ResponseEntity<?> res = controller.list(null, "acct-ada", 500, null);

        // The author direction does NOT clamp the cap itself - it asks with what was asked and lets the
        // service's own clamp decide, the same one every other door goes through.
        verify(service).commentsWritten("acct-ada", 500);
        assertThat(res.getBody()).isInstanceOf(CommentAnswer.class);
        CommentAnswer answer = (CommentAnswer) res.getBody();
        assertThat(answer.limit()).isEqualTo(500);
        assertThat(answer.comments()).hasSize(2);
        // visible is how many of the returned comments are NOT deleted.
        assertThat(answer.visible()).isEqualTo(1L);
    }

    @Test
    void aBlankProjectIdFallsThroughToTheAuthorDirection() {
        when(service.commentsWritten("acct-ada", CommentService.DEFAULT_COMMENT_LIMIT)).thenReturn(List.of());

        controller.list("   ", "acct-ada", null, null);

        verify(service).commentsWritten("acct-ada", CommentService.DEFAULT_COMMENT_LIMIT);
    }

    @Test
    void aQuestionThatNamesNeitherProjectNorAuthorIsRefusedByName() {
        assertThatThrownBy(() -> controller.list(null, null, null, null))
                .isInstanceOf(InvalidComment.class)
                .hasMessageContaining("whose comments they are");
    }

    @Test
    void aBrokenRuleIsA400ThatNamesIt() {
        ResponseEntity<Map<String, String>> res = controller.invalid(new InvalidComment("a comment must say something"));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody())
                .containsEntry("error", "invalid-comment")
                .containsEntry("message", "a comment must say something");
    }

    @Test
    void somebodyElsesCommentIsA403NotA400() {
        // The request was well-formed, so a 400 would tell the caller to fix a field that is fine.
        ResponseEntity<Map<String, String>> res = controller.notYours(new NotYourComment("that comment is not yours"));

        assertThat(res.getStatusCode().value()).isEqualTo(403);
        assertThat(res.getBody())
                .containsEntry("error", "not-your-comment")
                .containsEntry("message", "that comment is not yours");
    }
}
