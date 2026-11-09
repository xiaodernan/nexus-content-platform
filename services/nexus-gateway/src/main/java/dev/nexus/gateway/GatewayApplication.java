package dev.nexus.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * NEXUS — the API gateway (Spring Cloud SC-2).
 *
 * <p>docs/decisions/0011-backend-service-boundaries.md says the Studio "talks to the API gateway over
 * typed HTTP/WS contracts only". Until this module that door did not exist and {@code apps/studio} reached
 * {@code nexus-api} at a hard-coded 127.0.0.1:8080. This is the door: it resolves {@code lb://nexus-api}
 * through the registry, so the address of the system of record is a fact the registry holds rather than a
 * string in a frontend config file.
 *
 * <p>Bounds, stated rather than implied: one route (see {@link GatewayConfig}), no authentication, no rate
 * limiting, no TLS termination, and no WebSocket upgrade path yet. What it DOES promise is that a backend
 * it cannot reach produces a 503 naming the service and the failure — never a 200 with an empty list.
 */
@SpringBootApplication
public class GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}