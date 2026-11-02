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

    /**
     * {@code GET /health/live}: the process fact, and only that.
     *
     * <p>Always {@code 200} when this code runs. It does not borrow a connection, so it answers during an
     * outage instead of waiting behind the pool; a supervisor must read THIS door to decide whether to
     * restart the process, and {@code /health} or {@code /health/ready} to decide whether to send traffic.
     */
    @GetMapping(path = "/health/live", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HealthDtos.Liveness> live() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(health.liveness());
    }

    /**
     * {@code GET /health/ready}: the serving fact. {@code 200} when the database answers, {@code 503}
     * otherwise — the same measurement and the same status rule as {@code /health}, with the answer also
     * stated as {@code ready} in the body. A process that fails readiness is healthy and must not be
     * restarted; it must be taken out of rotation.
     */
    @GetMapping(path = "/health/ready", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HealthDtos.Readiness> ready() {
        HealthDtos.Readiness readiness = health.readiness();
        int status = readiness.ready() ? 200 : 503;
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(readiness);
    }
}
