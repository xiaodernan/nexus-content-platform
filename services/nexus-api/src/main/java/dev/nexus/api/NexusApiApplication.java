package dev.nexus.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * NEXUS — the system of record (ADR 0011).
 *
 * <p>M7 v193 is this service's first slice: a published project is a ROW, and the row is what the Studio's
 * publish control creates. Nothing else is wired yet — no auth, no accounts, no explore feed, no artifacts
 * beyond the one aggregate. The bounds are stated in the README rather than implied by the endpoint list.
 *
 * <p>{@code @EnableFeignClients} is what makes the DOMAIN service reachable by NAME: the Feign
 * interfaces in {@code dev.nexus.api.domain} are typed contracts, and the address behind the name
 * comes from discovery. The client bean is created at startup whether or not the domain service is
 * running — an unreachable peer is a fact about the CALL, not a reason this service cannot start.
 */
@SpringBootApplication
@EnableFeignClients
public class NexusApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(NexusApiApplication.class, args);
    }
}
