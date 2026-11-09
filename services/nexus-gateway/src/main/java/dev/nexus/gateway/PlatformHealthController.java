package dev.nexus.gateway;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * What the registry holds, measured rather than assumed.
 *
 * <p>Unlike {@code /platform/services} — a read of the registry — this endpoint performs one HTTP call per
 * discovered instance. The answer is point-in-time and names the address it actually called.
 *
 * <p><b>HTTP status:</b> always {@code 200} when the probe ran, even if {@code allUp} is false. The gateway
 * itself answered; a backend being down does not make the door unhealthy, and a 503 here would be
 * indistinguishable from this endpoint not existing. Callers gate on {@code allUp}, not on the status code.
 *
 * <p>Like {@code /platform/services}, this is a controller inside the gateway, so it is answered before the
 * route mapping and is not covered by the route edge policy (request-size, retry, rate limit). It is a
 * diagnostic, not a perimeter entry.
 */
@RestController
public class PlatformHealthController {

    private final ServiceHealthProbe probe;

    public PlatformHealthController(ServiceHealthProbe probe) {
        this.probe = probe;
    }

    @GetMapping("/platform/health")
    public Mono<Map<String, Object>> health() {
        return probe.probe();
    }
}
