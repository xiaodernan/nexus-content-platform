package dev.nexus.api.patches;

import dev.nexus.api.incidents.IncidentService;
import dev.nexus.api.incidents.NoSuchIncident;
import dev.nexus.api.patches.PatchDtos.PatchList;
import dev.nexus.api.patches.PatchDtos.PatchRecord;
import dev.nexus.api.patches.PatchDtos.OpenPatch;
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
 * M9 v595 — the HTTP surface for patches. Three doors:
 *
 * <ul>
 *   <li>{@code POST /incidents/{incidentId}/patches} — propose a change. 201 with the record, bytes
 *       included; 404 {@code unknown-incident} when the parent is not there; 400 {@code invalid-patch}
 *       when a rule broke.
 *   <li>{@code GET /incidents/{incidentId}/patches?limit=&offset=} — the newest window, scoped to one
 *       incident, with the window's count and the incident's total beside it.
 *   <li>{@code GET /patches/{patchId}} — one proposal, bytes included; 404 {@code unknown-patch}.
 * </ul>
 *
 * <p>There is no door that applies, approves, requests review of, or deploys a patch. Those are the
 * chain's later words and this build stops at the second one; a door that looked like them and did nothing
 * would be worse than an absent one.
 */
@RestController
public class PatchController {

    private final PatchService service;

    public PatchController(PatchService service) {
        this.service = service;
    }

    /** Propose a change against one incident. 201 when the row was made. */
    @PostMapping("/incidents/{incidentId}/patches")
    public ResponseEntity<PatchRecord> open(
            @PathVariable String incidentId,
            @RequestBody OpenPatch request) {
        IncidentPatch row = service.open(
                incidentId,
                request == null ? null : request.title(),
                request == null ? null : request.summary(),
                request == null ? null : request.diff(),
                request == null ? null : request.author());
        return ResponseEntity.status(201).body(record(row));
    }

    /**
     * The incident's newest proposals, with both counts beside the window.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the incident holds. {@code limit}
     * and {@code offset} are the values the query actually used.
     */
    @GetMapping("/incidents/{incidentId}/patches")
    public ResponseEntity<PatchList> list(
            @PathVariable String incidentId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? IncidentService.DEFAULT_LIST_LIMIT : limit;
        int from = offset == null ? 0 : offset;
        List<IncidentPatch> rows = service.list(incidentId, asked, from);
        int effective = IncidentService.effectiveLimit(asked);
        List<PatchRecord> records = rows.stream().map(PatchController::record).toList();
        return ResponseEntity.ok(new PatchList(
                records,
                records.size(),
                service.count(incidentId),
                effective,
                IncidentService.appliedOffset(from, effective)));
    }

    /** One proposal, bytes included. 404 when the id names nothing. */
    @GetMapping("/patches/{patchId}")
    public ResponseEntity<PatchRecord> read(@PathVariable String patchId) {
        return ResponseEntity.ok(record(service.read(patchId)));
    }

    /** One row as every answer carries it. The diff travels verbatim. */
    private static PatchRecord record(IncidentPatch row) {
        return new PatchRecord(
                row.getPatchId(),
                row.getIncidentId(),
                row.getTitle(),
                row.getSummary(),
                row.getDiff(),
                row.getAuthor(),
                row.getStatus(),
                row.getCreatedAt().toEpochMilli());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidPatch.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidPatch e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-patch", "message", e.getMessage()));
    }

    /** An id that names no proposal is a 404 under its own name. */
    @ExceptionHandler(NoSuchPatch.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchPatch e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-patch", "message", e.getMessage()));
    }

    /**
     * The parent door's refusal shares its token with the incident doors: a patch naming an incident that
     * does not exist is 404 {@code unknown-incident}, not 400 — the proposal may be perfectly well formed.
     */
    @ExceptionHandler(NoSuchIncident.class)
    public ResponseEntity<Map<String, String>> absentParent(NoSuchIncident e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-incident", "message", e.getMessage()));
    }
}
