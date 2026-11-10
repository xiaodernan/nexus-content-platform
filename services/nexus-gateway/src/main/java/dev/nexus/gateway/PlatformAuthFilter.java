package dev.nexus.gateway;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * The door's identity check for the gateway's OWN endpoints (SC-27).
 *
 * <p>{@link AuthFilter} is a Spring Cloud Gateway {@code GlobalFilter}: it only runs inside the route
 * pipeline. The gateway's own controllers ({@code /platform/services}, {@code /platform/health}) are answered
 * by the reactive stack BEFORE the route pipeline ever sees the request, so the door never checked them —
 * measured live on 2026-11-10: with auth enabled, {@code /platform/services} answered 200 with no token at
 * all, leaking every service id and address the registry holds.
 *
 * <p>This filter closes that gap by running in the reactive pipeline itself, ahead of everything else,
 * and applies exactly the same rules as {@link AuthFilter}: whitelist
 * ({@code /platform/health}, {@code /actuator/health}, {@code /fallback/**}), bearer verification against the
 * same secret, fail-closed, overwrite of {@code X-Nexus-Subject}/{@code X-Nexus-Scopes} on success. Route
 * traffic is checked twice (here, then again inside {@link AuthFilter}) — idempotent, deliberate, and the
 * second check costs one HMAC-SHA256 (~microseconds), not a behavior change.
 *
 * <p>Keep the two whitelists in sync with {@link AuthFilter}'s defaults; they must agree, or the door would
 * claim one truth at the route edge and another at its own endpoints.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class PlatformAuthFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(PlatformAuthFilter.class);

    private final boolean enabled;
    private final String secret;
    private final List<String> whitelistExact;
    private final List<String> whitelistPrefixes;

    PlatformAuthFilter(
            @org.springframework.beans.factory.annotation.Value("${nexus.gateway.auth.enabled:false}")
            boolean enabled,
            @org.springframework.beans.factory.annotation.Value("${nexus.gateway.auth.secret:}")
            String secret) {
        this(enabled, secret, List.of("/platform/health", "/actuator/health"), List.of("/fallback"));
    }

    PlatformAuthFilter(boolean enabled, String secret, List<String> whitelistExact, List<String> whitelistPrefixes) {
        if (enabled && (secret == null || secret.isBlank())) {
            throw new IllegalStateException(
                    "nexus.gateway.auth.enabled=true but nexus.gateway.auth.secret is blank; "
                            + "refusing to start an open door");
        }
        this.enabled = enabled;
        this.secret = secret;
        this.whitelistExact = whitelistExact;
        this.whitelistPrefixes = whitelistPrefixes;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        if (!enabled) {
            return chain.filter(exchange);
        }
        String path = exchange.getRequest().getURI().getRawPath();
        if (isWhitelisted(path)) {
            return chain.filter(exchange);
        }
        String token = bearerToken(exchange);
        AuthFilter.Verification result =
                token == null ? AuthFilter.Verification.missing() : AuthFilter.verify(token, secret);
        if (!result.ok()) {
            if (log.isInfoEnabled()) {
                log.info(
                        "gateway auth refused (platform surface) {} {}: {}",
                        exchange.getRequest().getMethod(),
                        path,
                        result.reason());
            }
            return reject(exchange, result.reason());
        }
        ServerWebExchange mutated = exchange.mutate()
                .request(exchange.getRequest().mutate()
                        .header(AuthFilter.SUBJECT_HEADER, result.subject())
                        .header(AuthFilter.SCOPES_HEADER, String.join(",", result.scopes()))
                        .build())
                .build();
        return chain.filter(mutated);
    }

    private boolean isWhitelisted(String path) {
        if (path == null) {
            return false;
        }
        for (String exact : whitelistExact) {
            if (exact.equals(path)) {
                return true;
            }
        }
        for (String prefix : whitelistPrefixes) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private static String bearerToken(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst(AuthFilter.AUTH_HEADER);
        if (header == null || !header.startsWith("Bearer ")) {
            return null;
        }
        String token = header.substring("Bearer ".length()).trim();
        return token.isEmpty() ? null : token;
    }

    private Mono<Void> reject(ServerWebExchange exchange, String reason) {
        org.springframework.http.server.reactive.ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String body = "{\"error\":\"unauthorized\",\"reason\":\"" + reason
                + "\",\"note\":\"present Authorization: Bearer <token>; /platform/health and /fallback/** are open\"}";
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
    }
}
