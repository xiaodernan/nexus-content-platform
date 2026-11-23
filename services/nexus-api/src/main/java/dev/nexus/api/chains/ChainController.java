package dev.nexus.api.chains;

import dev.nexus.api.chains.ChainDtos.ChainView;
import dev.nexus.api.incidents.NoSuchIncident;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 v871 — one read-only door: the whole chain of one incident.
 *
 * <p>{@code GET /incidents/{incidentId}/chain} answers the incident, its patches, each patch's review
 * requests, and each request's decisions and deployments. It answers 404 {@code unknown-incident} for an id
 * that names nothing — the incident door's own token, not a new one — and it has no writing verb of any kind.
 */
@RestController
public class ChainController {

    private final ChainService service;

    public ChainController(ChainService service) {
        this.service = service;
    }

    /** The chain of one incident, five words deep, bounded at every level by the listing cap. */
    @GetMapping("/incidents/{incidentId}/chain")
    public ResponseEntity<ChainView> read(@PathVariable String incidentId) {
        return ResponseEntity.ok(service.read(incidentId));
    }

    /** An id that names no incident is the incident door's 404, under its own token. */
    @ExceptionHandler(NoSuchIncident.class)
    public ResponseEntity<Map<String, String>> absent(NoSuchIncident e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-incident", "message", e.getMessage()));
    }
}
