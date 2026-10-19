package dev.nexus.api.ops;

import java.time.Instant;
import java.util.List;
import org.springframework.http.ResponseEntity;
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
            long createdAt,
            String assurance) {
    }

    /** The trail. {@code count} is what the answer CARRIED; {@code limit} is the cap that was applied. */
    public record Trail(List<Entry> entries, int count, int limit) {
    }

    private final AuditService service;

    public AuditController(AuditService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Trail> list(@RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? AuditService.DEFAULT_LIST_LIMIT : limit;
        List<Entry> entries = service.list(asked).stream()
                .map(row -> new Entry(
                        String.valueOf(row.getId()),
                        row.getAction(),
                        row.getActorAccountId(),
                        row.getTargetId(),
                        row.getOccurredAt().toEpochMilli(),
                        row.getActorAssurance()))
                .toList();
        return ResponseEntity.ok(new Trail(entries, entries.size(), Math.min(Math.max(asked, 1), AuditService.MAX_LIST_LIMIT)));
    }
}
