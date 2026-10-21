package dev.nexus.api.moderation;

import dev.nexus.api.moderation.ModerationDtos.DeskAnswer;
import dev.nexus.api.moderation.ModerationDtos.DeskEntry;
import dev.nexus.api.moderation.ModerationDtos.DispositionAnswer;
import dev.nexus.api.moderation.ModerationDtos.TallyAnswer;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M7 v304 — the HTTP surface for the OWNER'S DESK.
 *
 * <p>Two doors: read the desk, and acknowledge a report on it. The account is named as a query parameter
 * — the same way the follow's withdrawal and the report's withdrawal name their claimer — because this
 * build has no session to hold it (ADR 0018).
 *
 * <p>The refusals keep the distinction the social package makes: a request that broke a rule is a 400
 * that names the rule, and a request that was understood and refused is a 403.
 */
@RestController
@RequestMapping("/moderation")
public class ModerationController {

    private final ModerationService service;

    public ModerationController(ModerationService service) {
        this.service = service;
    }

    /** The desk: the reports against the publications this account owns, newest first. */
    @GetMapping("/reports")
    public ResponseEntity<DeskAnswer> desk(
            @RequestParam(name = "owner") String ownerAccountId,
            @RequestParam(name = "limit", required = false) Integer limit) {
        int asked = limit == null ? ModerationService.DEFAULT_DESK_LIMIT : limit;
        List<DeskEntry> rows = service.deskOf(ownerAccountId, asked);
        return ResponseEntity.ok(new DeskAnswer(
                ownerAccountId == null ? null : ownerAccountId.trim(),
                rows,
                asked));
    }

    /**
     * The TALLY: how many reports against this account's work, by reason and by status.
     *
     * <p>It is a door of its own rather than a field on the desk, because the desk is a WINDOW (the most
     * recent hundred) and the tally counts every report — a number computed from a window would be wrong
     * in exactly the direction a creator acts on.
     */
    @GetMapping("/tally")
    public ResponseEntity<TallyAnswer> tally(@RequestParam(name = "owner") String ownerAccountId) {
        return ResponseEntity.ok(service.tallyOf(ownerAccountId));
    }

    /**
     * Acknowledge a report: the owner of the publication says they have seen it.
     *
     * <p>200 either way — a report that was already disposed of is "already disposed of", not an error,
     * because the URL names a report rather than a resource that must exist. The answer says whether the
     * status MOVED, so a caller is never told a report moved when it did not.
     */
    @PostMapping("/reports/{reportId}/acknowledge")
    public ResponseEntity<DispositionAnswer> acknowledge(
            @PathVariable String reportId,
            @RequestParam(name = "owner") String ownerAccountId) {
        return ResponseEntity.ok(service.acknowledge(reportId, ownerAccountId));
    }

    /**
     * A rule the caller broke is a 400 that NAMES it. Anything else is a 500 and says nothing.
     */
    @ExceptionHandler(InvalidModeration.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidModeration e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-moderation", "message", e.getMessage()));
    }

    /**
     * Somebody else's publication is 403, not 400: the request was well-formed, so a 400 would tell the
     * caller to fix a field that is fine.
     */
    @ExceptionHandler(NotYourPublication.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourPublication e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-publication", "message", e.getMessage()));
    }
}
