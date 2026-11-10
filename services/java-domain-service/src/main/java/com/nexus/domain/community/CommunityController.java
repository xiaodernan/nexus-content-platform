package com.nexus.domain.community;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The community HTTP surface (SC-17), reachable through the gateway's {@code /domain/**} route:
 * {@code POST /domain/api/v1/community/publications/{id}/like} and
 * {@code POST /domain/api/v1/community/users/{id}/follow}.
 *
 * <p><b>Identity comes from the door, never from the body.</b> The actor is {@code X-Nexus-Subject}, which
 * nexus-gateway's AuthFilter OVERWRITES on the trusted request after verifying a signed token. Taking an
 * {@code actorId} from the payload instead would let any caller like or follow as anybody else. The header
 * must parse as a user UUID: a deployment minting tokens whose {@code sub} is something else gets a 401 here
 * rather than a write against a guessed identity.
 *
 * <p>The trust bound is the same one SecurityConfig states: this port is not published, and the gateway is
 * the only thing that sets that header. Hit directly, this service is anonymous — so it refuses to act
 * instead of inventing a caller.
 *
 * <p>A block is a 200 with {@code blocked} set, not an error: it is a boundary the caller can act on. A
 * missing/private version and a self-follow are errors, with the sentence the policy supplies.
 */
@RestController
@RequestMapping("/api/v1/community")
public class CommunityController {

    /** Must match the gateway's AuthFilter.SUBJECT_HEADER. */
    static final String SUBJECT_HEADER = "X-Nexus-Subject";

    private final CommunityService service;
    private final CommunityPolicy policy;

    public CommunityController(CommunityService service, CommunityPolicy policy) {
        this.service = service;
        this.policy = policy;
    }

    @PostMapping("/publications/{publicationId}/like")
    public ResponseEntity<CommunityService.LikeState> like(
            @PathVariable UUID publicationId,
            @RequestHeader(value = SUBJECT_HEADER, required = false) String subject) {
        return ResponseEntity.ok(service.toggleLike(actor(subject), publicationId));
    }

    @PostMapping("/users/{userId}/follow")
    public ResponseEntity<CommunityService.FollowState> follow(
            @PathVariable UUID userId,
            @RequestHeader(value = SUBJECT_HEADER, required = false) String subject) {
        return ResponseEntity.ok(service.toggleFollow(actor(subject), userId));
    }

    /**
     * Which policy this process is enforcing. Without this readout "the two services share one policy" is a
     * claim about the build; with it, a running pair can be compared over the wire.
     */
    @GetMapping("/policy")
    public ResponseEntity<Map<String, Object>> policy() {
        JsonNode document = policy.asJson();
        return ResponseEntity.ok(Map.of(
                "source", CommunityPolicy.RESOURCE,
                "policy", document,
                "note", "值来自 packages/schemas/src/community-policy.ts 的导出；web 与本服务读同一份"));
    }

    private static UUID actor(String subject) {
        if (subject == null || subject.isBlank()) {
            throw new CommunityRefusal("unauthenticated", "缺少可信身份：这一层只认网关转发的 " + SUBJECT_HEADER);
        }
        try {
            return UUID.fromString(subject.trim());
        } catch (IllegalArgumentException e) {
            throw new CommunityRefusal("bad_subject", SUBJECT_HEADER + " 不是用户 UUID，落不到任何人身上");
        }
    }

    @ExceptionHandler(CommunityRefusal.class)
    public ResponseEntity<Map<String, String>> refusal(CommunityRefusal refusal) {
        int status = switch (refusal.getCode()) {
            case "not_found", "not_public" -> 404;
            case "unauthenticated" -> 401;
            case "bad_subject" -> 401;
            default -> 400;
        };
        return ResponseEntity.status(status).body(Map.of("error", refusal.getCode(), "message", refusal.getMessage()));
    }
}