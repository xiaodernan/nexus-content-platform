package dev.nexus.api.reviews;

import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.reviews.DecisionDtos.Decide;
import dev.nexus.api.reviews.DecisionDtos.DecisionList;
import dev.nexus.api.reviews.DecisionDtos.DecisionRecord;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 v869 — the HTTP surface for decisions. Three doors:
 *
 * <ul>
 *   <li>{@code POST /pull-requests/{pullRequestId}/decisions} — record the verdict. 201 with the decision;
 *       404 {@code unknown-pull-request} when the request is not there; 400 {@code invalid-decision} when a
 *       rule broke; 409 {@code already-decided} when the request is no longer open.
 *   <li>{@code GET /pull-requests/{pullRequestId}/decisions?limit=&offset=} — the newest window, scoped to
 *       one request, with both counts beside it.
 *   <li>{@code GET /decisions/{decisionId}} — one decision; 404 {@code unknown-decision}.
 * </ul>
 *
 * <p>There is no door that merges, applies or deploys. Those are the chain's fifth word and beyond; a door
 * that looked like them and did nothing would be worse than an absent one.
 */
@RestController
public class DecisionController {

    private final DecisionService service;

    public DecisionController(DecisionService service) {
        this.service = service;
    }

    /** Decide one open request. 201 when the row was made. */
    @PostMapping("/pull-requests/{pullRequestId}/decisions")
    public ResponseEntity<DecisionRecord> decide(
            @PathVariable String pullRequestId,
            @RequestBody Decide request) {
        PullRequestDecision row = service.decide(
                pullRequestId,
                request == null ? null : request.verdict(),
                request == null ? null : request.reason(),
                request == null ? null : request.decidedBy());
        return ResponseEntity.status(201).body(record(row));
    }

    /**
     * The request's newest decisions, with both counts beside the window.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the request holds. {@code limit}
     * and {@code offset} are the values the query actually used.
     */
    @GetMapping("/pull-requests/{pullRequestId}/decisions")
    public ResponseEntity<DecisionList> list(
            @PathVariable String pullRequestId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? IncidentService.DEFAULT_LIST_LIMIT : limit;
        int from = offset == null ? 0 : offset;
        List<PullRequestDecision> rows = service.list(pullRequestId, asked, from);
        int effective = IncidentService.effectiveLimit(asked);
        List<DecisionRecord> records = rows.stream().map(DecisionController::record).toList();
        return ResponseEntity.ok(new DecisionList(
                records,
                records.size(),
                service.count(pullRequestId),
                effective,
                IncidentService.appliedOffset(from, effective)));
    }

    /** One decision. 404 when the id names nothing. */
    @GetMapping("/decisions/{decisionId}")
    public ResponseEntity<DecisionRecord> read(@PathVariable String decisionId) {
        return ResponseEntity.ok(record(service.read(decisionId)));
    }

    /** One row as every answer carries it. */
    private static DecisionRecord record(PullRequestDecision row) {
        return new DecisionRecord(
                row.getDecisionId(),
                row.getPullRequestId(),
                row.getVerdict(),
                row.getReason(),
                row.getDecidedBy(),
                row.getDecidedAt().toEpochMilli());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidDecision.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidDecision e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-decision", "message", e.getMessage()));
    }

    /** An id that names no decision is a 404 under its own name. */
    @ExceptionHandler(NoSuchDecision.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchDecision e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-decision", "message", e.getMessage()));
    }

    /** The parent door's refusal: a decision about a request that does not exist is 404 unknown-pull-request. */
    @ExceptionHandler(NoSuchPullRequest.class)
    public ResponseEntity<Map<String, String>> absentParent(NoSuchPullRequest e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-pull-request", "message", e.getMessage()));
    }

    /** A request that is no longer open is a 409: the state conflicts, the syntax did not. */
    @ExceptionHandler(AlreadyDecided.class)
    public ResponseEntity<Map<String, String>> conflict(AlreadyDecided e) {
        return ResponseEntity.status(409).body(Map.of("error", "already-decided", "message", e.getMessage()));
    }
}
