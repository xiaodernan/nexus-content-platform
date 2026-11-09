package dev.nexus.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * NEXUS — the edge (Spring Cloud Gateway).
 *
 * <p>This process is the front door. It routes a request to the service that owns the answer, and
 * when that service is not reachable it says so in a shape a caller can act on — a 503 whose body
 * NAMES the service that could not be reached.
 *
 * <p>The second sentence above is the whole design position of this service, and it is worth being
 * explicit about why. A gateway is the one place where a failure is most likely to be dressed up:
 * the upstream is gone, the edge is very much alive, and a naive edge can answer "200 OK, empty
 * body" to a caller that has just been handed nothing. That is a lie with a status code on it. The
 * fallback handler in {@code UpstreamFallbackHandler} is the place where this repo refuses to
 * write that lie.
 */
@SpringBootApplication
public class NexusGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(NexusGatewayApplication.class, args);
    }
}
