package dev.nexus.registry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * NEXUS — the service registry (Spring Cloud SC-1).
 *
 * <p>One Eureka server holding the addresses of the services that register with it. It owns no business
 * table: ADR 0011 gives PostgreSQL to {@code nexus-api} and Redis/pgvector to the AI service, and a registry
 * that also stored domain rows would be a fourth answer to "where does this fact live".
 *
 * <p>What it does NOT do is stated in the README rather than implied by this annotation: no authentication
 * (anyone who can reach it can register any service id), no persistence (the registry is in memory, so a
 * restart forgets every address and clients re-register on their next heartbeat), and no peer replication.
 */
@SpringBootApplication
@EnableEurekaServer
public class RegistryApplication {
    public static void main(String[] args) {
        SpringApplication.run(RegistryApplication.class, args);
    }
}