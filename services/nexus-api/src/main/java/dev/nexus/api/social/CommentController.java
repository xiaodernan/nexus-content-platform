package dev.nexus.api.social;

import dev.nexus.api.social.CommentDtos.Comment;
import dev.nexus.api.social.CommentDtos.CommentAnswer;
import dev.nexus.api.social.CommentDtos.CommentClaim;
import dev.nexus.api.social.CommentDtos.CommentRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M7 v285 — the HTTP surface for COMMENTS.
 *
 * <p>Three doors, and the difference between them is the difference between the rules:
 *
 * <ul>
 *   <li>{@code POST /comments} — say something about a publication. The body carries the project id, the
 *       CLAIM and the body of the comment.
 *   <li>{@code DELETE /comments/{commentId}} — take a comment back. The claimer arrives as a QUERY
 *       PARAMETER, exactly as a like\u2019s and a publication\u2019s take-down do, because a DELETE with no body
 *       is the conventional shape.
 *   <li>{@code GET /comments?projectId=\u2026} — the comments of a publication, and how many of them are VISIBLE.
 * </ul>
 *
 * <p>The controller owns only HTTP: every rule lives in {@link CommentService}, and the refusals are
 * translated here into the status codes that carry the difference \u2014 400 for a request that broke a rule,
 * 403 for a request that was understood and refused.
 */
@RestController
@RequestMapping("/comments")
public class CommentController {

    private final CommentService service;

    public CommentController(CommentService service) {
        this.service = service;
    }

    /** Say something. 201 when the comment was written. */
    @PostMapping
    public ResponseEntity<CommentAnswer> comment(@RequestBody CommentRequest request) {
        CommentEntry row = service.comment(
                request == null ? null : request.projectId(),
                request == null ? null : request.claim(),
                request == null ? null : request.body());
        return ResponseEntity.status(201).body(new CommentAnswer(
                row.getTargetProjectId(),
                List.of(toWire(row)),
                1L,
                CommentService.DEFAULT_COMMENT_LIMIT));
    }

    /**
     * Take a comment back. 200 either way: a comment that is already gone is \u201calready gone\u201d, not an
     * error, because the URL names a comment rather than a resource that must exist.
     */
    @DeleteMapping("/{commentId}")
    public ResponseEntity<Map<String, Object>> delete(
            @PathVariable String commentId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        CommentClaim claim = claimerAccountId == null ? null : new CommentClaim(claimerAccountId, null, null, null);
        boolean removed = service.delete(commentId, claim);
        return ResponseEntity.ok(Map.of("ok", true, "commentId", commentId, "removed", removed));
    }

    /**
     * The comments of one publication — or, with `author`, the comments one account WROTE.
     *
     * <p>Deleted comments come back too, with their flag set: a reader who can see that a comment was
     * removed is better served than a reader who cannot tell a quiet thread from a deleted one.
     *
     * <p>v335 — the same door, the other direction, the way the tips and the subscriptions doors answer
     * both sides of a relation. A reader who wrote a comment could not see what they had written, and a
     * comment is a thing a person might want to find again, or take back.
     *
     * <p>v399 — and the THREAD direction PAGES: `offset` is ROWS past the newest comments, the same
     * meaning the filed read's offset has (v387), so a reader on a thread longer than the cap can reach
     * the older comments. The answer carries the window it answered — the cap applied, the row it
     * starts at, and the thread's ROW count (the removed ones included, because that is what a pager
     * pages by). The author direction does not page and says so by carrying no window at all.
     */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "projectId", required = false) String projectId,
            @RequestParam(name = "author", required = false) String authorAccountId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? CommentService.DEFAULT_COMMENT_LIMIT : limit;
        // v399 — the window the SERVICE applied, and the row it starts at, both computed here so the
        // answer can echo exactly what was answered rather than what the caller half remembers.
        int applied = asked <= 0 ? CommentService.DEFAULT_COMMENT_LIMIT : Math.min(asked, CommentService.MAX_COMMENT_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        if (projectId == null || projectId.isBlank()) {
            if (authorAccountId == null || authorAccountId.isBlank()) {
                throw new InvalidComment("a comment question names whose comments they are");
            }
            List<Comment> written = service.commentsWritten(authorAccountId, asked).stream()
                    .map(CommentController::toWire)
                    .toList();
            long visible = written.stream().filter(c -> !c.deleted()).count();
            return ResponseEntity.ok(new CommentAnswer(authorAccountId, written, visible, asked));
        }
        // v399 — and the thread PAGES, in rows, with the window it answered carried on the answer: a
        // reader on a thread longer than the cap can reach the older comments, and the page can say
        // WHICH rows it is showing instead of inferring it from the URL it was handed.
        CommentService.CommentResult result = service.commentsOf(projectId, applied, from);
        List<Comment> comments = result.comments().stream().map(CommentController::toWire).toList();
        return ResponseEntity.ok(new CommentDtos.ThreadAnswer(
                result.projectId(), comments, result.visible(), applied, from, result.total()));
    }

    /** The service's row, as the wire's shape. */
    private static Comment toWire(CommentEntry row) {
        return new Comment(
                row.getCommentId(),
                row.getAuthorAccountId(),
                row.getTargetProjectId(),
                row.getBody(),
                row.getCreatedAt().toEpochMilli(),
                row.isDeleted(),
                row.getAuthorHandle(),
                row.getAuthorAssurance());
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidComment.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidComment e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-comment", "message", e.getMessage()));
    }

    /**
     * Somebody else\u2019s comment is 403, not 400: the request was well-formed, so a 400 would tell the
     * caller to fix a field that is fine.
     */
    @ExceptionHandler(NotYourComment.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourComment e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-comment", "message", e.getMessage()));
    }
}
