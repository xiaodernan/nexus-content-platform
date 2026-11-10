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
 * <p>SC-32: the whitelist, the path-boundary rule, the blank-secret guard and the 401 body are no longer
 * copied here — both doors delegate to the single {@link AuthPolicy}. What used to be a "keep them in sync"
 * COMMENT is now a mechanism, checked on every request by {@code AuthWhitelistParityTest}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class PlatformAuthFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(PlatformAuthFilter.class);

    private final boolean enabled;
    private final String secret;
    private final List<String> whitelistExact;
    private final List<String> whitelistPrefixes;

    @org.springframework.beans.factory.annotation.Autowired
    PlatformAuthFilter(
            @org.springframework.beans.factory.annotation.Value("${nexus.gateway.auth.enabled:false}")
            boolean enabled,
            @org.springframework.beans.factory.annotation.Value("${nexus.gateway.auth.secret:}")
            String secret) {
        this(enabled, secret, AuthPolicy.OPEN_EXACT, AuthPolicy.OPEN_PREFIXES);
    }

    PlatformAuthFilter(boolean enabled, String secret, List<String> whitelistExact, List<String> whitelistPrefixes) {
        // SC-32: identical construction-time fail-closed to AuthFilter — one implementation, two doors.
        AuthPolicy.requireSecret(enabled, secret);
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
        // SC-32: the SAME path-SEGMENT rule as AuthFilter via AuthPolicy — /fallbackish is guarded on both.
        return AuthPolicy.isOpen(path, whitelistExact, whitelistPrefixes);
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
        // SC-32: one refusal dialect for both doors; a caller sees ONE 401 shape for the whole gateway.
        String body = AuthPolicy.refusalBody(reason);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
    }
}
