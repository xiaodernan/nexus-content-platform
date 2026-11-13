package dev.nexus.api.domain;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import java.util.UUID;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * The typed client for the DOMAIN service.
 *
 * <p>This is the service-to-service call the platform's own services make: {@code nexus-api} reads
 * the domain service's project rows over HTTP, addressed by a NAME rather than a URL. The name is
 * resolved by the discovery client (Eureka) and the load balancer, so the address of the domain
 * service is a fact of the running topology rather than a value somebody typed into a config file
 * and forgot.
 *
 * <p>Why a Feign client at all, rather than a {@code RestTemplate} or a hand-written HTTP call:
 *
 * <ul>
 *   <li>the CONTRACT is the interface — a method that returns {@link DomainProject} says what the
 *       caller gets, and the compiler checks it;</li>
 *   <li>the address is NOT in the interface — it comes from discovery, so a second instance of the
 *       domain service is reachable without a redeploy;</li>
 *   <li>the failure is a typed thing — a 404 arrives as {@code FeignException.NotFound}, which the
 *       caller can tell apart from a connection failure. That difference is what keeps
 *       "the service is down" from being reported as "the project does not exist".</li>
 * </ul>
 *
 * <p>The {@code name} is the SERVICE NAME, not a URL. That is what makes {@code lb://} routing work,
 * and it is why the same interface works whether the domain service is on this host, in a container,
 * or on another machine.
 */
@FeignClient(name = "nexus-domain-service")
public interface DomainServiceClient {

    /**
     * Read one project by id.
     *
     * <p>The path is the domain service's OWN path ({@code /api/v1/projects/{id}}). A client that
     * rewrote the path to suit its own routing would break the moment the domain service changed
     * its surface — which is the coupling a boundary is supposed to prevent.
     *
     * @throws feign.FeignException.NotFound when the domain service answers and holds no such project.
     */
    @GetMapping("/api/v1/projects/{id}")
    DomainProject getProject(@PathVariable("id") UUID id);
}
