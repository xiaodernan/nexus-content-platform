package dev.nexus.api.status;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 — {@code GET /health/vitals}: what the process's own JVM reports about itself.
 *
 * <p>This is not a serving fact. It answers {@code 200} whenever the process answers, because the numbers
 * are the process's own; nothing about the database decides this door. The status stays 200 even when the
 * heap is nearly full — a number worth alerting on is not a number that changes the HTTP contract, and a
 * caller reading vitals should alert on the VALUES, not on a status code that would otherwise have to
 * encode a threshold this service does not own.
 *
 * <p>{@code Cache-Control: no-store} because a sampled number served from a cache is a past fact. Nothing
 * is written and no history is kept; each call is one sample.
 */
@RestController
public class VitalsController {

    private final VitalsService vitals;

    public VitalsController(VitalsService vitals) {
        this.vitals = vitals;
    }

    @GetMapping(path = "/health/vitals", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HealthDtos.Vitals> read() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(vitals.read());
    }
}
