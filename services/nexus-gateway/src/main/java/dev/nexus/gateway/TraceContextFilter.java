package dev.nexus.gateway;

import java.security.SecureRandom;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * W3C Trace Context (§SC-30) on every routed request: an open, vendor-neutral {@code traceparent} that a
 * Jaeger / Zipkin / OpenTelemetry collector, an upstream service mesh, or any other W3C-speaking hop can join.
 *
 * <p><b>Why this is not the correlation id.</b> {@link CorrelationFilter} mints {@code X-Request-Id}, a
 * NEXUS-private id that lets OUR backend logs quote the same string as the caller's response. That is useful,
 * but no external tracing system reads a made-up header. {@code traceparent} is the W3C standard format those
 * systems DO read, so the two headers are complementary, not redundant: one is ours, one is the industry's.
 * Nothing here samples, exports, or calls a vendor — the ids are random bytes this door mints, which is why
 * the platform can speak W3C while staying DEMO-MODE-honest about having no tracing backend (ADR 0010).
 *
 * <p><b>The one semantic that separates a real implementation from a string copy.</b> A gateway is a HOP, not
 * the original caller. When a well-formed {@code traceparent} arrives, the trace-id and the trace-flags are
 * preserved (so the whole distributed trace stays one trace), but the 16-hex PARENT-ID is replaced with a
 * fresh one: the id the downstream backend sees as its parent must be THIS hop's span, not the id the caller
 * used for its own. Echoing the incoming parent-id unchanged would make every hop in the chain share one span
 * id — a trace that looks connected but lies about its shape. A missing or malformed parent (all-zero ids,
 * wrong length, unsupported version, non-hex) is discarded and a whole new context is minted; we never
 * propagate garbage just because a caller sent it.
 *
 * <p>{@code tracestate} is forwarded verbatim when present: W3C says a hop that does not understand a vendor
 * entry must not drop it. Runs just after {@link CorrelationFilter} (+20), still before routing.
 */
final class TraceContextFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(TraceContextFilter.class);

    /** Just after correlation (+20), before routing. A refused request never needs a trace context. */
    static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 21;

    static final String TRACEPARENT = "traceparent";
    static final String TRACESTATE = "tracestate";

    private static final String VERSION = "00";
    private static final int TRACEPARENT_LENGTH = 55; // 2 + 1 + 32 + 1 + 16 + 1 + 2
    private static final int TRACE_ID_START = 3;
    private static final int TRACE_ID_END = 35;
    private static final int PARENT_ID_START = 36;
    private static final int PARENT_ID_END = 52;
    private static final int FLAGS_START = 53;
    private static final String ALL_ZERO_TRACE = "0".repeat(32);
    private static final String ALL_ZERO_PARENT = "0".repeat(16);

    private final SecureRandom random = new SecureRandom();

    /** A parsed, structurally-valid W3C traceparent. The flags are carried, never interpreted. */
    record Parent(String version, String traceId, String parentId, String flags) {}

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String incoming = exchange.getRequest().getHeaders().getFirst(TRACEPARENT);
        Parent parsed = parse(incoming);
        String outgoing = (parsed == null) ? fresh() : continueTrace(parsed);

        ServerWebExchange mutated = exchange.mutate()
                .request(exchange.getRequest().mutate().header(TRACEPARENT, outgoing).build())
                .build();
        // Echo on the response so the caller can quote the exact context the backend saw.
        mutated.getResponse().getHeaders().set(TRACEPARENT, outgoing);

        if (log.isTraceEnabled()) {
            log.trace("gateway trace context: {} -> backend parent {}", outgoing, parentIdOf(outgoing));
        }
        return chain.filter(mutated);
    }

    /**
     * Parse a W3C version-00 {@code traceparent}. Returns null for anything we must not build on: wrong length,
     * unsupported version, non-hex ids, all-zero trace-id or all-zero parent-id (both forbidden by the spec).
     * Public for tests so the acceptance rule lives with the filter, not in a parallel test-only copy.
     */
    static Parent parse(String value) {
        if (value == null || value.length() != TRACEPARENT_LENGTH) {
            return null;
        }
        String v = value.substring(0, 2);
        if (!VERSION.equals(v) || value.charAt(2) != '-' || value.charAt(35) != '-' || value.charAt(52) != '-') {
            return null;
        }
        String traceId = value.substring(TRACE_ID_START, TRACE_ID_END).toLowerCase(Locale.ROOT);
        String parentId = value.substring(PARENT_ID_START, PARENT_ID_END).toLowerCase(Locale.ROOT);
        String flags = value.substring(FLAGS_START).toLowerCase(Locale.ROOT);
        if (!isHex(traceId) || !isHex(parentId) || !isHex(flags)) {
            return null;
        }
        if (ALL_ZERO_TRACE.equals(traceId) || ALL_ZERO_PARENT.equals(parentId)) {
            return null;
        }
        return new Parent(v, traceId, parentId, flags);
    }

    /** Keep the caller's trace-id + flags, but mint a NEW parent-id — this gateway is a hop, not the caller. */
    private String continueTrace(Parent p) {
        return VERSION + "-" + p.traceId() + "-" + hex(random, 8) + "-" + p.flags();
    }

    /** Mint a whole new trace context for a caller with none (or a malformed one). */
    private String fresh() {
        return VERSION + "-" + hex(random, 16) + "-" + hex(random, 8) + "-00";
    }

    private static boolean isHex(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
                return false;
            }
        }
        return true;
    }

    private static String hex(SecureRandom random, int byteCount) {
        byte[] bytes = new byte[byteCount];
        random.nextBytes(bytes);
        StringBuilder out = new StringBuilder(byteCount * 2);
        for (byte b : bytes) {
            out.append(Character.forDigit((b >> 4) & 0xF, 16));
            out.append(Character.forDigit(b & 0xF, 16));
        }
        return out.toString();
    }

    /** The 16-hex parent-id carried in a traceparent, for diagnostics; null for a malformed value. */
    static String parentIdOf(String value) {
        Parent p = parse(value);
        return p == null ? null : p.parentId();
    }

    @Override
    public int getOrder() {
        return ORDER;
    }
}
