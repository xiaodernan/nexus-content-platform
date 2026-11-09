package dev.nexus.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The route table, in Java.
 *
 * <p>Why not YAML: the Gateway 4.2+ line moved {@code spring.cloud.gateway.*} to
 * {@code spring.cloud.gateway.server.webflux.*}. A route table written against a prefix a dependency bump
 * renames does not fail — it stops matching, and every request answers 404 from a gateway that started
 * cleanly. The DSL below is compiled, so the same rename is a build error.
 *
 * <p>Why ONE route and not the discovery locator: {@code discovery.locator.enabled} publishes
 * {@code /{serviceId}/**} for EVERY service in the registry, including the registry itself and anything
 * somebody registers later. That turns "can reach the registry" into "can reach every backend", which is an
 * authorisation decision this slice has not made. Adding a backend is a deliberate edit here.
 *
 * <p>{@code lb://} is the discovery half: the host is a SERVICE ID, resolved through the registry and the
 * load balancer, so two instances of {@code nexus-api} are two addresses the gateway can choose between
 * without anybody editing a config file.
 */
@Configuration
public class GatewayConfig {

    @Bean
    RouteLocator nexusRoutes(
            RouteLocatorBuilder builder,
            @Value("${nexus.gateway.api-service:nexus-api}") String service,
            @Value("${nexus.gateway.api-prefix:/api}") String prefix) {
        // "/api" is one segment; a prefix of "/platform/api" would be two, and stripping one would leave
        // the backend answering a path it never published.
        int segments = (int) java.util.Arrays.stream(prefix.split("/")).filter((s) -> !s.isEmpty()).count();
        String fallback = "forward:/fallback/" + service;
        return builder.routes()
                .route(service, r -> r.path(prefix + "/**")
                        .filters(f -> f.stripPrefix(segments)
                                .circuitBreaker(c -> c.setName(service).setFallbackUri(fallback)))
                        .uri("lb://" + service))
                .build();
    }
}