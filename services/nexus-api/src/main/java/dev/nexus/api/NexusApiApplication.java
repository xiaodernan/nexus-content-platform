package dev.nexus.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * NEXUS — the system of record (ADR 0011).
 *
 * <p>M7 v193 is this service's first slice: a published project is a ROW, and the row is what the Studio's
 * publish control creates. Nothing else is wired yet — no auth, no accounts, no explore feed, no artifacts
 * beyond the one aggregate. The bounds are stated in the README rather than implied by the endpoint list.
 */
@SpringBootApplication
public class NexusApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(NexusApiApplication.class, args);
    }
}
