package dev.nexus.api.status;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 — {@code GET /health}: one public, credential-free read of the two facts.
 *
 * <p>HTTP carries the distinction the body also states: a process whose database answers is {@code 200},
 * and a process that answers but whose database does not is {@code 503}. Answering 503 rather than 200 is
 * the whole point of the door — a load balancer that read 200 would keep sending traffic to a service that
 * cannot serve, and a 503 with a body still tells an operator that the process itself is up.
 *
 * <p>{@code Cache-Control: no-store} because an uptime that is served from a cache is a past fact wearing
 * the present tense.
 *
 * <p>No authentication: a probe cannot carry a credential (ADR 0018's public-read rule), and the body
 * carries nothing a credential would protect. Nothing here writes.
 */
@RestController
public class HealthController {

    private final HealthService health;

    public HealthController(HealthService health) {
        this.health = health;
    }

    @GetMapping(path = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HealthDtos.Health> read() {
        HealthDtos.Health report = health.report();
        int status = report.database().reachable() ? 200 : 503;
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(report);
    }
}
