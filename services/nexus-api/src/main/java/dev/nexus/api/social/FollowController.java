package dev.nexus.api.social;

import dev.nexus.api.social.FollowDtos.Follow;
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

    /** Who follows that account, and whether the viewer is among them. */
    @GetMapping
    public ResponseEntity<FollowAnswer> list(
            @RequestParam(name = "accountId") String accountId,
            @RequestParam(name = "viewer", required = false) String viewerAccountId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? FollowService.DEFAULT_FOLLOW_LIMIT : limit;
        return ResponseEntity.ok(toWire(service.followersOf(accountId, viewerAccountId, asked)));
    }

    /** The service's rows, as the wire's shape. */
    private static FollowAnswer toWire(FollowService.FollowResult result) {
        List<Follow> followers = result.followers().stream()
                .map(row -> new Follow(
                        row.getFollowerAccountId(),
                        row.getFolloweeAccountId(),
                        row.getCreatedAt().toEpochMilli(),
                        null))
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
