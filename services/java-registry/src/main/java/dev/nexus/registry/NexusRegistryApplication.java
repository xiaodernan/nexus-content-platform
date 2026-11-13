package dev.nexus.registry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * NEXUS — the service registry (Spring Cloud Netflix Eureka server).
 *
 * <p>This process answers one question for the platform: <em>which instances of a named service
 * are alive right now</em>. Everything else about those services — what they own, what they
 * wrote, whether they are healthy in any deeper sense — is their own business and is NOT this
 * registry's concern. Keeping the two apart is what lets the registry be started, stopped, and
 * replaced without touching the write path.
 *
 * <p>It is deliberately a SINGLE node with no peer replication. A second registry would need a
 * peer-sync story, and a peer-sync story that is not exercised is a story nobody should believe;
 * the bound is stated in the README instead of being implied by a dashboard.
 *
 * <p>The registry is also deliberately OFF the traffic path: clients use it to learn addresses,
 * then call those addresses directly. A registry outage therefore degrades DISCOVERY (a client
 * falls back to its configured addresses) and not the data plane.
 */
@SpringBootApplication
@EnableEurekaServer
public class NexusRegistryApplication {
    public static void main(String[] args) {
        SpringApplication.run(NexusRegistryApplication.class, args);
    }
}
