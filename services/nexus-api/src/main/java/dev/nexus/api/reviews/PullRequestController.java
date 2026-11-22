package dev.nexus.api.reviews;

import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.patches.NoSuchPatch;
import dev.nexus.api.reviews.PullRequestDtos.OpenPullRequest;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestList;
import dev.nexus.api.reviews.PullRequestDtos.PullRequestRecord;
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
 * M9 v868 — the HTTP surface for review requests. Three doors:
 *
 * <ul>
 *   <li>{@code POST /patches/{patchId}/pull-requests} — put a patch up for review. 201 with the record;
 *       404 {@code unknown-patch} when the patch is not there; 400 {@code invalid-pull-request} when a rule
 *       broke; 409 {@code already-open} when the patch already has an open request.
 *   <li>{@code GET /patches/{patchId}/pull-requests?limit=&offset=} — the newest window, scoped to one
 *       patch, with the window's count and the patch's total beside it.
 *   <li>{@code GET /pull-requests/{pullRequestId}} — one request; 404 {@code unknown-pull-request}.
 * </ul>
 *
 * <p>There is no door that approves, rejects, merges or deploys a request. Those are the chain's later
 * words and this build stops at the third one; a door that looked like them and did nothing would be worse
 * than an absent one.
 */
@RestController
public class PullRequestController {

    private final PullRequestService service;

    public PullRequestController(PullRequestService service) {
        this.service = service;
    }

    /** Put a patch up for review. 201 when the row was made. */
    @PostMapping("/patches/{patchId}/pull-requests")
    public ResponseEntity<PullRequestRecord> open(
            @PathVariable String patchId,
            @RequestBody OpenPullRequest request) {
        PatchPullRequest row = service.open(
                patchId,
                request == null ? null : request.title(),
                request == null ? null : request.summary(),
                request == null ? null : request.openedBy());
        return ResponseEntity.status(201).body(record(row));
    }

    /**
     * The patch's newest requests, with both counts beside the window.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the patch holds. {@code limit}
     * and {@code offset} are the values the query actually used.
     */
    @GetMapping("/patches/{patchId}/pull-requests")
    public ResponseEntity<PullRequestList> list(
            @PathVariable String patchId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? IncidentService.DEFAULT_LIST_LIMIT : limit;
        int from = offset == null ? 0 : offset;
        List<PatchPullRequest> rows = service.list(patchId, asked, from);
        int effective = IncidentService.effectiveLimit(asked);
        List<PullRequestRecord> records = rows.stream().map(PullRequestController::record).toList();
        return ResponseEntity.ok(new PullRequestList(
                records,
                records.size(),
                service.count(patchId),
                effective,
                IncidentService.appliedOffset(from, effective)));
    }

    /** One request. 404 when the id names nothing. */
    @GetMapping("/pull-requests/{pullRequestId}")
    public ResponseEntity<PullRequestRecord> read(@PathVariable String pullRequestId) {
        return ResponseEntity.ok(record(service.read(pullRequestId)));
    }

    /** One row as every answer carries it. The bytes stay in the patch table; this record names them. */
    private static PullRequestRecord record(PatchPullRequest row) {
        return new PullRequestRecord(
                row.getPullRequestId(),
                row.getPatchId(),
                row.getTitle(),
                row.getSummary(),
                row.getStatus(),
                row.getOpenedBy(),
                row.getOpenedAt().toEpochMilli());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidPullRequest.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidPullRequest e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-pull-request", "message", e.getMessage()));
    }

    /** An id that names no request is a 404 under its own name. */
    @ExceptionHandler(NoSuchPullRequest.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchPullRequest e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-pull-request", "message", e.getMessage()));
    }

    /** The parent door's refusal: a request for a patch that does not exist is 404 {@code unknown-patch}. */
    @ExceptionHandler(NoSuchPatch.class)
    public ResponseEntity<Map<String, String>> absentParent(NoSuchPatch e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-patch", "message", e.getMessage()));
    }

    /** A patch that already has an open request is a 409: the state conflicts, the syntax did not. */
    @ExceptionHandler(AlreadyOpenPullRequest.class)
    public ResponseEntity<Map<String, String>> conflict(AlreadyOpenPullRequest e) {
        return ResponseEntity.status(409).body(Map.of("error", "already-open", "message", e.getMessage()));
    }
}
