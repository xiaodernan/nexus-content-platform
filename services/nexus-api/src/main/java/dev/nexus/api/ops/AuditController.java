package dev.nexus.api.ops;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * v271 — the OBSERVABILITY door: {@code GET /audit}.
 *
 * <p>The wire shape is the one the Studio's own ops model already declares, field for field: the id is a
 * string, the instant is epoch MILLISECONDS (the same unit the claim's own instant travels in, and the one
 * the client's {@code createdAt: number} expects), and the assurance travels with the actor so a reader is
 * told what the entry is worth instead of having to infer it.
 *
 * <p>{@code actorId} and {@code assurance} are NULLABLE here, and the client's model says otherwise: an
 * anonymous publish has no actor, and the trail records that rather than inventing one. The client's type is
 * the one that will have to widen — this service will not fake an actor to fit a type.
 *
 * <p>v384 — and {@code targetType} says what KIND of thing the target id names (account, plan or
 * publication), declared by the caller that acted rather than guessed from the id's spelling. It is never
 * null on this wire: the service refuses an entry that does not name a kind.
 *
 * <p>v385 — and the listing can be narrowed to ONE ACTION, in the query: the window a caller gets is the
 * newest N entries OF THAT ACTION, and {@code total} says how many the whole trail holds narrowed or not,
 * because a filter the service applies is a filter the browser can no longer see past.
 */
@RestController
@RequestMapping("/audit")
public class AuditController {

    /**
     * One entry. The fields are the client's {@code AuditEntry} exactly, with the instant in epoch
     * milliseconds.
     */
    public record Entry(
            String id,
            String action,
            String actorId,
            String targetId,
            String targetType,
            long createdAt,
            String assurance) {
    }

    /**
     * The trail. {@code count} is what the answer CARRIED; {@code limit} is the cap that was applied;
     * {@code total} is how many the WHOLE trail holds, narrowed or not (v385).
     */
    public record Trail(List<Entry> entries, int count, int limit, long total) {
    }

    private final AuditService service;

    public AuditController(AuditService service) {
        this.service = service;
    }

    /**
     * v385 — narrowed to one action when the caller names one, and always beside the WHOLE trail's size.
     *
     * <p>An action outside the service's own set is refused by name (400), the same way the desk refuses
     * a reason it does not have (v326): answering a question about a verb this service never recorded
     * with an empty window would read as "nothing of that action ever happened".
     */
    @GetMapping
    public ResponseEntity<Trail> list(
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "action", required = false) String action) {
        int asked = limit == null ? AuditService.DEFAULT_LIST_LIMIT : limit;
        List<Entry> entries = service.list(asked, action).stream()
                .map(row -> new Entry(
                        String.valueOf(row.getId()),
                        row.getAction(),
                        row.getActorAccountId(),
                        row.getTargetId(),
                        row.getTargetType(),
                        row.getOccurredAt().toEpochMilli(),
                        row.getActorAssurance()))
                .toList();
        return ResponseEntity.ok(new Trail(
                entries,
                entries.size(),
                Math.min(Math.max(asked, 1), AuditService.MAX_LIST_LIMIT),
                service.count()));
    }

    /**
     * A filter the service does not know is a 400 that NAMES the set — the same shape the moderation
     * door answers with, so a caller is told which question it may ask rather than only that it may not.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-audit-filter", "message", e.getMessage()));
    }
}
