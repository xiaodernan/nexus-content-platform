package dev.nexus.api.social;

import dev.nexus.api.social.LikeDtos.Like;
import dev.nexus.api.social.LikeDtos.LikeAnswer;
import dev.nexus.api.social.LikeDtos.LikesAnswer;
import dev.nexus.api.social.LikeDtos.LikeClaim;
import dev.nexus.api.social.LikeDtos.LikeRequest;
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
 * M7 v283 — the HTTP surface for LIKES.
 *
 * <p>Three doors, and the difference between them is the difference between the three rules:
 *
 * <ul>
 *   <li>{@code POST /likes} — like a publication. The body carries the project id and the CLAIM; the
 *       answer carries the count after the like and whether this account is among the likers.
 *   <li>{@code DELETE /likes/{projectId}} — take the like back. The claimer arrives as a QUERY
 *       PARAMETER, exactly as the publication's take-down does, because a DELETE with no body is the
 *       conventional shape.
 *   <li>{@code GET /likes?projectId=…} — the likes, the count, and whether the VIEWER is among them.
 * </ul>
 *
 * <p>The controller owns only HTTP: every rule lives in {@link LikeService}, and the refusals are
 * translated here into the status codes that carry the difference — 400 for a request that broke a rule,
 * 403 for a request that was understood and refused.
 */
@RestController
@RequestMapping("/likes")
public class LikeController {

    private final LikeService service;

    public LikeController(LikeService service) {
        this.service = service;
    }

    /**
     * Like a publication.
     *
     * <p>201 when the like was NEW and 200 when it was already there — the same distinction the
     * publish receipt makes. A caller that liked twice gets 200 and the same count, and the difference
     * is visible without reading the body.
     */
    @PostMapping
    public ResponseEntity<LikeAnswer> like(@RequestBody LikeRequest request) {
        LikeService.LikeResult answer = service.like(
                request == null ? null : request.projectId(),
                request == null ? null : request.claim());
        return ResponseEntity.status(answer.count() > 0 && answer.liked() ? 201 : 200).body(toWire(answer));
    }

    /**
     * Take a like back.
     *
     * <p>200 either way: a like that is already gone is "already gone", not an error, because the URL
     * names a pair rather than a resource that must exist.
     */
    @DeleteMapping("/{projectId}")
    public ResponseEntity<LikeAnswer> unlike(
            @PathVariable String projectId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        LikeClaim claim = claimerAccountId == null ? null : new LikeClaim(claimerAccountId, null, null, null);
        return ResponseEntity.ok(toWire(service.unlike(projectId, claim)));
    }

    /**
     * The likes of one publication.
     *
     * <p>{@code viewer} is the account asking, and it decides the {@code liked} flag — nothing else.
     * A reader who is nobody still gets a true answer: the count does not depend on who is asking.
     *
     * <p>v400 — and the list PAGES: {@code offset} is ROWS past the newest likes, the same meaning the
     * filed read’s offset has (v387), so a reader on a publication liked by more accounts than the cap
     * can reach the older likers. The answer carries the window it answered — the cap applied, the row it
     * starts at — beside the whole count, so the page can say WHICH likers it is showing instead of
     * inferring it from the URL it was handed.
     */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "projectId") String projectId,
            @RequestParam(name = "viewer", required = false) String viewerAccountId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? LikeService.DEFAULT_LIKE_LIMIT : limit;
        // v400 — the window the SERVICE applied, and the row it starts at, both computed here so the
        // answer can echo exactly what was answered rather than what the caller half remembers.
        int applied = asked <= 0 ? LikeService.DEFAULT_LIKE_LIMIT : Math.min(asked, LikeService.MAX_LIKE_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        LikeService.LikeResult answer = service.likesOf(projectId, viewerAccountId, applied, from);
        List<Like> likes = answer.likes().stream().map(LikeController::toWire).toList();
        return ResponseEntity.ok(new LikesAnswer(
                answer.projectId(), answer.liked(), answer.count(), likes, applied, from));
    }

    /** One row, as the wire's shape: the client's three fields, plus the two the service knows. */
    private static Like toWire(LikeEntry row) {
        return new Like(
                row.getActorAccountId(),
                row.getTargetProjectId(),
                row.getCreatedAt().toEpochMilli(),
                row.getActorHandle(),
                row.getActorAssurance());
    }

    /** The service's whole answer, as the wire's shape. */
    private static LikeAnswer toWire(LikeService.LikeResult answer) {
        List<Like> likes = answer.likes().stream().map(LikeController::toWire).toList();
        return new LikeAnswer(answer.projectId(), answer.liked(), answer.count(), likes);
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidLike.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidLike e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-like", "message", e.getMessage()));
    }
}
