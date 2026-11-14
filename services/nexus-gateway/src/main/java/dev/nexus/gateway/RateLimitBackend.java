package dev.nexus.gateway;

import reactor.core.publisher.Mono;

/**
 * Where the request counter lives.
 *
 * <p>Two honest answers, selected by {@code nexus.gateway.rate-limit.backend}:
 *
 * <ul>
 *   <li>{@code memory} — a per-instance token bucket. No second process; two gateways allow twice the
 *       configured rate. This is the default because the door must answer without Redis.
 *   <li>{@code redis} — one atomic token bucket per client in Redis, shared by every gateway instance that
 *       points at the same server. Adds a network hop to the edge and a dependency the limiter treats as
 *       optional: see {@link RateLimitFilter} for what happens when the backend fails.
 * </ul>
 *
 * <p>The method returns {@code Mono<Boolean>} because the shared backend is asynchronous. A backend that
 * completes empty is treated as "no answer", which the filter handles the same way as an error.
 */
interface RateLimitBackend {

    /** {@code true} = the request may proceed; {@code false} = this client is over its rate. */
    Mono<Boolean> tryAcquire(String clientKey);

    /** Printed once at startup, so a running gateway names the backend it actually uses. */
    String describe();
}
