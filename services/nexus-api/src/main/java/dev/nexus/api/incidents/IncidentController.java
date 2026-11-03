package dev.nexus.api.incidents;

import dev.nexus.api.incidents.IncidentDtos.IncidentList;
import dev.nexus.api.incidents.IncidentDtos.IncidentRecord;
import dev.nexus.api.incidents.IncidentDtos.OpenIncident;
import dev.nexus.api.incidents.IncidentDtos.ResolveIncident;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 v594 — the HTTP surface for incidents. Four doors, and the differences between them are the rules:
 *
 * <ul>
 *   <li>{@code POST /incidents} — open a record. 201 with the record as it was written; a request that
 *       broke a rule is 400 {@code invalid-incident} naming it.
 *   <li>{@code GET /incidents?status=&severity=&limit=&offset=} — the newest window, with the count of the
 *       window, the count of the whole narrowed table, and the values actually applied. A blank or unknown
 *       filter is 400 BEFORE any read: an empty window would read as "there are none".
 *   <li>{@code GET /incidents/{id}} — one record; an id that names nothing is 404 {@code unknown-incident}.
 *   <li>{@code POST /incidents/{id}/resolve} — close one. 200 with the resolved record; a second resolve is
 *       409 {@code already-resolved}, and an unknown id is 404.
 * </ul>
 *
 * <p>There is no reopen, no assignment, no comment, no patch and no approval door: M9's chain continues past
 * this word and this build stops at the first one. A caller that needs the rest is told what exists rather
 * than handed a door that looks like it and does nothing.
 */
@RestController
@RequestMapping("/incidents")
public class IncidentController {

    private final IncidentService service;

    public IncidentController(IncidentService service) {
        this.service = service;
    }

    /** Open a record. 201 when the row was made. */
    @PostMapping
    public ResponseEntity<IncidentRecord> open(@RequestBody OpenIncident request) {
        Incident row = service.open(
                request == null ? null : request.title(),
                request == null ? null : request.summary(),
                request == null ? null : request.severity(),
                request == null ? null : request.targetKind(),
                request == null ? null : request.targetId(),
                request == null ? null : request.openedBy());
        return ResponseEntity.status(201).body(record(row));
    }

    /**
     * The newest window of incidents, and the two counts beside it.
     *
     * <p>The filters are validated by the service before a query runs; {@code count} is what this answer
     * carried, {@code total} is what the whole narrowed table holds, and {@code limit}/{@code offset} are
     * the values the query actually used — a request for row 15 in a window of 10 is told the service read
     * from row 10.
     */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "severity", required = false) String severity,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? IncidentService.DEFAULT_LIST_LIMIT : limit;
        int from = offset == null ? 0 : offset;
        List<Incident> rows = service.list(asked, from, status, severity);
        int effective = IncidentService.effectiveLimit(asked);
        List<IncidentRecord> records = rows.stream().map(IncidentController::record).toList();
        return ResponseEntity.ok(new IncidentList(
                records,
                records.size(),
                service.count(status, severity),
                effective,
                IncidentService.appliedOffset(from, effective),
                status == null ? null : status.trim(),
                severity == null ? null : severity.trim()));
    }

    /** One record. 404 when the id names nothing. */
    @GetMapping("/{incidentId}")
    public ResponseEntity<IncidentRecord> read(@PathVariable String incidentId) {
        return ResponseEntity.ok(record(service.read(incidentId)));
    }

    /** Close one. 200 with the resolved record; 409 when it was already closed; 404 when it is not there. */
    @PostMapping("/{incidentId}/resolve")
    public ResponseEntity<IncidentRecord> resolve(
            @PathVariable String incidentId,
            @RequestBody(required = false) ResolveIncident request) {
        return ResponseEntity.ok(record(service.resolve(
                incidentId, request == null ? null : request.resolvedBy())));
    }

    /** One row as every answer carries it. The wire's instant unit is milliseconds, like every door here. */
    private static IncidentRecord record(Incident row) {
        return new IncidentRecord(
                row.getIncidentId(),
                row.getTitle(),
                row.getSummary(),
                row.getSeverity(),
                row.getTargetKind(),
                row.getTargetId(),
                row.getStatus(),
                row.getOpenedBy(),
                row.getOpenedAt().toEpochMilli(),
                row.getResolvedBy(),
                row.getResolvedAt() == null ? null : row.getResolvedAt().toEpochMilli());
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidIncident.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidIncident e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-incident", "message", e.getMessage()));
    }

    /** An id that names no record is a 404 — "nothing to read", not "nothing happened". */
    @ExceptionHandler(NoSuchIncident.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchIncident e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-incident", "message", e.getMessage()));
    }

    /** A second resolve is a 409: the request was legal, the record's STATE refuses it. */
    @ExceptionHandler(AlreadyResolved.class)
    public ResponseEntity<Map<String, String>> already(AlreadyResolved e) {
        return ResponseEntity.status(409).body(Map.of("error", "already-resolved", "message", e.getMessage()));
    }
}
