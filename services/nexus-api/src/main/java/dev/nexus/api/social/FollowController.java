package dev.nexus.api.social;

import dev.nexus.api.social.FollowDtos.Follow;
import dev.nexus.api.social.FollowDtos.FollowingAnswer;
import dev.nexus.api.social.FollowDtos.FollowAnswer;
import dev.nexus.api.social.FollowDtos.FollowClaim;
import dev.nexus.api.social.FollowDtos.FollowRequest;
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
 * M7 v287 — the HTTP surface for FOLLOWS.
 *
 * <p>Three doors, and the difference between them is the difference between the rules:
 *
 * <ul>
 *   <li>{@code POST /follows} — follow an account. The body carries the account id and the CLAIM.
 *   <li>{@code DELETE /follows/{accountId}} — take the edge back. The claimer arrives as a QUERY
 *       PARAMETER, because a DELETE with no body is the conventional shape.
 *   <li>{@code GET /follows?accountId=…} — who follows that account, how many, and whether the VIEWER is
 *       among them.
 * </ul>
 *
 * <p>The controller owns only HTTP: every rule lives in {@link FollowService}, and the refusals are
 * translated here into the status codes that carry the difference.
 */
@RestController
@RequestMapping("/follows")
public class FollowController {

    private final FollowService service;

    public FollowController(FollowService service) {
        this.service = service;
    }

    /** Follow an account. 201 when the edge was NEW and 200 when it was already there. */
    @PostMapping
    public ResponseEntity<FollowAnswer> follow(@RequestBody FollowRequest request) {
        FollowService.FollowResult result = service.follow(
                request == null ? null : request.accountId(),
                request == null ? null : request.claim());
        return ResponseEntity.status(201).body(toWire(result));
    }

    /** Take the edge back. 200 either way: an edge that is already gone is "already gone", not an error. */
    @DeleteMapping("/{accountId}")
    public ResponseEntity<FollowAnswer> unfollow(
            @PathVariable String accountId,
            @RequestParam(name = "claimer", required = false) String claimerAccountId) {
        FollowClaim claim = claimerAccountId == null ? null : new FollowClaim(claimerAccountId, null, null, null);
        return ResponseEntity.ok(toWire(service.unfollow(accountId, claim)));
    }

    /**
     * Who follows that account, and whether the viewer is among them.
     *
     * <p>v303 — and the OTHER direction of the edge, with `follower=`: the accounts an account FOLLOWS.
     * The two directions are different questions ("who watches me" and "who do I watch"), and one query
     * cannot answer both — which is why the finder has one name per direction.
     *
     * <p>v390 — and the following window can be PAGED: `offset` is ROWS past the newest ones, the same
     * meaning the filed read's offset has (v382), so a reader who follows more accounts than the cap can
     * reach the older ones. A negative offset is clamped to the first window rather than refused —
     * the newest rows are the honest answer to a question about a page before the first.
     *
     * <p>v397 — and so can the FOLLOWERS window, which is the door this page has needed longest: a
     * creator followed by more accounts than the cap had the older followers out of reach entirely. The
     * answer carries the window it answered (`limit` and `offset`), so a pager can say which followers
     * it is showing rather than inferring it from the URL it was handed.
     */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "accountId", required = false) String accountId,
            @RequestParam(name = "follower", required = false) String followerAccountId,
            @RequestParam(name = "viewer", required = false) String viewerAccountId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? FollowService.DEFAULT_FOLLOW_LIMIT : limit;
        // v397 — the window the SERVICE applied, computed here so the answer can echo exactly that
        // and not a number the caller half remembers: a pager that is told a window size the service
        // did not use would offer a page of the wrong shape.
        int applied = asked <= 0 ? FollowService.DEFAULT_FOLLOW_LIMIT : Math.min(asked, FollowService.MAX_FOLLOW_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        if (followerAccountId != null && !followerAccountId.isBlank()) {
            FollowService.FollowingResult result = service.followingOf(followerAccountId, applied, from);
            List<Follow> following = result.following().stream()
                    .map(row -> new Follow(
                            row.getFollowerAccountId(),
                            row.getFolloweeAccountId(),
                            row.getCreatedAt().toEpochMilli(),
                            row.getFollowerHandle(),
                            row.getFollowerAssurance()))
                    .toList();
            return ResponseEntity.ok(new FollowingAnswer(
                    result.accountId(),
                    result.followingCount(),
                    following,
                    applied));
        }
        if (accountId == null || accountId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-follow",
                    "message", "the accountId parameter is missing (or the follower parameter, for the other direction)"));
        }
        // v397 — and the followers window PAGES, in rows, with the window it answered carried on the
        // answer: the reader who is followed by more accounts than the cap can reach the older ones,
        // and the profile page's follow bar can say WHICH followers it is showing (v397).
        return ResponseEntity.ok(
                withWindow(service.followersOf(accountId, viewerAccountId, applied, from), applied, from));
    }

    /**
     * v397 — the read's window, carried beside the rows.
     *
     * <p>A read and a write are different questions, so the read's answer is its OWN record: the
     * followers a WRITE carries are the edge it just made, and a window named on that would be a
     * window of nothing.
     */
    private static FollowDtos.FollowersAnswer withWindow(
            FollowService.FollowResult result, int limit, int offset) {
        List<Follow> followers = result.followers().stream()
                .map(row -> new Follow(
                        row.getFollowerAccountId(),
                        row.getFolloweeAccountId(),
                        row.getCreatedAt().toEpochMilli(),
                        row.getFollowerHandle(),
                        row.getFollowerAssurance()))
                .toList();
        return new FollowDtos.FollowersAnswer(
                result.accountId(),
                result.following(),
                result.followerCount(),
                result.followingCount(),
                followers,
                limit,
                offset);
    }

    /** The service's rows, as the wire's shape. */
    private static FollowAnswer toWire(FollowService.FollowResult result) {
        List<Follow> followers = result.followers().stream()
                .map(row -> new Follow(
                        row.getFollowerAccountId(),
                        row.getFolloweeAccountId(),
                        row.getCreatedAt().toEpochMilli(),
                        row.getFollowerHandle(),
                        row.getFollowerAssurance()))
                .toList();
        return new FollowAnswer(
                result.accountId(),
                result.following(),
                result.followerCount(),
                result.followingCount(),
                followers);
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidFollow.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidFollow e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-follow", "message", e.getMessage()));
    }
}
