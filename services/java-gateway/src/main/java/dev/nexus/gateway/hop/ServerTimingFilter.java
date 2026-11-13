package dev.nexus.gateway.hop;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * v670 — every answer the edge gives carries the wall-clock time it took, on the WIRE, as a
 * {@code Server-Timing} measurement.
 *
 * <p><b>Why this class exists.</b> The edge wrote per-request lines as it served them (v656),
 * but a caller had no way to tell which hop spent the time from the response itself — the
 * operator reading the log line at 03:00 knows the edge saw the request, but a browser dev-tools
 * tab does not. The W3C <code>Server-Timing</code> header is the closest thing the web has to a
 * standard way to carry per-hop durations alongside a response: it lives in the same headers
 * Chrome's DevTools → Network panel reads, and `curl -D -` shows it plainly.
 *
 * <p><b>What the value is.</b> {@code Server-Timing: edge;dur=<milliseconds>}. The edge itself
 * is the only party that knows how long its own half took; downstream timings belong to the
 * services behind it (nexus-api, java-domain-service) and those services have their own access
 * patterns. What this header reports is the edge half of the story; a slow chain shows the edge's
 * own cheap number next to a slow client-observed wall time, which is honest — it says the edge
 * was NOT the bottleneck, and the browser can then look down the chain for the real culprit.
 *
 * <p><b>Honest limitation.</b> This is the edge's own time only. Downstream services currently
 * write no {@code Server-Timing}; that is their choice to add. This filter does not pretend to
 * measure what happens behind it.
 *
 * <p><b>Order and hook.</b> {@code HIGHEST_PRECEDENCE + 1} — one inside HopLogFilter so the log
 * observed the request before this filter touches headers. The duration is captured with
 * {@code System.nanoTime()} at filter entry and read at
 * {@link org.springframework.web.server.ServerWebExchange#beforeCommit} time, which fires when
 * the response body is about to flush — the latest point at which headers can still change.
 * Setting the header any later (after the write has started, or in {@code doFinally})
 * would either no-op on a committed response or throw, turning a working stream into a 500.
 */
@Component
public class ServerTimingFilter implements GlobalFilter, Ordered {

    private static final String HEADER = "Server-Timing";
    private static final String HEADER_KEY = "edge";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long began = System.nanoTime();
        var response = exchange.getResponse();
        response.beforeCommit(() -> {
            long durMs = Math.max(0, (System.nanoTime() - began) / 1_000_000);
            try {
                HttpHeaders headers = response.getHeaders();
                headers.set(HEADER, HEADER_KEY + ";dur=" + durMs);
            } catch (IllegalStateException committed) {
                // Before-commit means the headers are frozen by the time the hook runs in some
                // reactive paths. If that happened to this response, dropping one header beats
                // turning working calls into 500s.
            }
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        // Inside HopLogFilter; outside the work the route does. Any inner filter that short-
        // circuits still terminates through this one, which is what Ordered is for.
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
