package dev.nexus.api.status;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * M9 — {@code GET /health/traffic}: the ledger this process keeps about what it has served.
 *
 * <p>Always {@code 200} while the process answers. Traffic is a USAGE fact, like vitals: no threshold decides
 * a status code, and a process with many 5xx responses still answers this door with the counts that say so.
 * The door does not borrow a connection, so it answers during a database outage — the moment an operator
 * most wants to know whether requests are still arriving.
 *
 * <p>{@code Cache-Control: no-store}: a ledger served from a cache is a past count. Nothing is written.
 */
@RestController
public class TrafficController {

    private final TrafficMeter meter;

    public TrafficController(TrafficMeter meter) {
        this.meter = meter;
    }

    @GetMapping(path = "/health/traffic", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<TrafficDtos.Traffic> read() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(meter.snapshot());
    }
}
