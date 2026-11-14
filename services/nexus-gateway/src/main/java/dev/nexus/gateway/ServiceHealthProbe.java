package dev.nexus.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

/**
 * Asks every instance the registry holds one question — {@code GET /actuator/health} — and reports what it
 * answered.
 *
 * <p>Why this exists: {@code /platform/services} lists addresses, and the registry lists leases. Neither is a
 * health check, and an operator reading either one has to guess which services actually answer. This probe is
 * the measured answer, with the caller-facing caveat written into every response.
 *
 * <p>Three statuses, and the distinction is the point:
 *
 * <ul>
 *   <li>{@code UP} — the instance answered 2xx with {@code {"status":"UP"}}.
 *   <li>{@code DOWN} — it answered non-2xx (actuator answers 503 when it is down), reported DOWN /
 *       OUT_OF_SERVICE, or refused the connection. A refusal is a measurement: nothing is listening there.
 *   <li>{@code UNKNOWN} — we got no usable answer: a timeout, an unreadable 2xx, any other transport error.
 *       Calling a timeout DOWN would invent a fact; a slow instance is not the same as a dead one.
 * </ul>
 *
 * <p><b>Reactive on purpose.</b> This method is called from a WebFlux controller, i.e. on a Netty event-loop
 * thread. A {@code block()} here throws {@code "block()/blockFirst()/blockLast() are blocking"} immediately —
 * measured by {@code PlatformHealthWiringTest}, whose first version caught exactly that and reported every
 * instance as UNKNOWN. The probe therefore composes {@link Mono} and never blocks. Instances are probed
 * concurrently with a small ceiling, because a health answer is point-in-time: N silent instances must not
 * cost N × timeout before the first row is known.
 *
 * <p>Timeouts are short by design ({@code NEXUS_GATEWAY_HEALTH_TIMEOUT_MS}, 1500 ms default). A health probe
 * that takes thirty seconds has stopped being a health probe and become an incident. 1500 ms rather than
 * 800 ms is measured, not guessed: on 2026-11-09 the first probe after a backend start read UNKNOWN while
 * that backend's servlet was still initializing, and a healthy cold service should not look unmeasured.
 */
@Component
class ServiceHealthProbe {

    static final String HEALTH_PATH = "/actuator/health";

    /** Enough concurrency for a local topology; a ceiling keeps a large registry from opening N sockets. */
    private static final int MAX_CONCURRENT_PROBES = 8;

    private final ObjectProvider<DiscoveryClient> discovery;
    private final WebClient client;
    private final long timeoutMs;
    private final ObjectMapper mapper = new ObjectMapper();

    ServiceHealthProbe(
            ObjectProvider<DiscoveryClient> discovery,
            @Value("${nexus.gateway.health-probe-timeout-ms:1500}") long timeoutMs) {
        this.discovery = discovery;
        this.timeoutMs = Math.max(50, timeoutMs);
        this.client = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(
                        HttpClient.create().responseTimeout(Duration.ofMillis(this.timeoutMs))))
                .build();
    }

    Mono<Map<String, Object>> probe() {
        return Mono.defer(() -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("measuredAt", Instant.now().toString());
            out.put("timeoutMs", timeoutMs);
            DiscoveryClient discoveryClient = discovery.getIfAvailable();
            if (discoveryClient == null) {
                out.put("source", "none");
                out.put("services", List.of());
                out.put("instances", 0);
                out.put("allUp", false);
                out.put(
                        "note",
                        "no discovery client is wired in this gateway; nothing was measured — this is not a"
                                + " platform with zero services");
                return Mono.just(out);
            }
            out.put("source", discoveryClient.description());
            return Flux.fromIterable(discoveryClient.getServices())
                    .flatMap(id -> probeService(discoveryClient, id), MAX_CONCURRENT_PROBES)
                    .collectList()
                    .map(services -> {
                        int total = services.stream()
                                .mapToInt(service -> ((List<?>) service.get("instances")).size())
                                .sum();
                        boolean allUp = total > 0
                                && services.stream().allMatch(service -> (boolean) service.get("up"));
                        out.put("services", services);
                        out.put("instances", total);
                        out.put("allUp", allUp);
                        out.put(
                                "note",
                                total == 0
                                        ? "the registry answered and holds no instance; nothing was measured"
                                        : "status is this gateway's GET " + HEALTH_PATH + " on each address the"
                                                + " registry holds; a timeout is UNKNOWN, not DOWN, because no"
                                                + " answer is not a negative answer");
                        return out;
                    });
        });
    }

    private Mono<Map<String, Object>> probeService(DiscoveryClient discoveryClient, String id) {
        List<ServiceInstance> instances = discoveryClient.getInstances(id);
        return Flux.fromIterable(instances)
                .flatMap(this::probeOne, MAX_CONCURRENT_PROBES)
                .collectList()
                .map(rows -> {
                    boolean up = !rows.isEmpty() && rows.stream().allMatch(row -> "UP".equals(row.get("status")));
                    Map<String, Object> service = new LinkedHashMap<>();
                    service.put("id", id);
                    service.put("instances", rows);
                    // A service id with no address is not "all up": there is nothing to call.
                    service.put("up", up);
                    return service;
                });
    }

    private Mono<Map<String, Object>> probeOne(ServiceInstance instance) {
        String uri = instance.getUri().toString();
        return client
                .get()
                .uri(uri + HEALTH_PATH)
                .exchangeToMono(response -> response
                        .bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .map(body -> classify(response.statusCode().value(), body)))
                .timeout(Duration.ofMillis(timeoutMs))
                .onErrorResume(error -> Mono.just(failed(error)))
                .map(result -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("uri", uri);
                    row.putAll(result);
                    return row;
                });
    }

    private Map<String, Object> classify(int httpStatus, String body) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("httpStatus", httpStatus);
        String reported = reportedStatus(body);
        if (httpStatus >= 200 && httpStatus < 300) {
            if ("UP".equals(reported)) {
                row.put("status", "UP");
                row.put("detail", null);
            } else if ("DOWN".equals(reported) || "OUT_OF_SERVICE".equals(reported)) {
                row.put("status", "DOWN");
                row.put("detail", "reported " + reported);
            } else {
                row.put("status", "UNKNOWN");
                row.put("detail", "HTTP " + httpStatus + " without a recognizable status field");
            }
        } else {
            row.put("status", "DOWN");
            row.put("detail", "answered HTTP " + httpStatus);
        }
        return row;
    }

    private String reportedStatus(String body) {
        try {
            Map<?, ?> parsed = mapper.readValue(body, Map.class);
            Object status = parsed.get("status");
            return status instanceof String text ? text : null;
        } catch (IOException | RuntimeException ignored) {
            // A 2xx that is not the actuator document is still an answer we cannot read as health.
            return null;
        }
    }

    private Map<String, Object> failed(Throwable error) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("httpStatus", null);
        if (hasCause(error, java.util.concurrent.TimeoutException.class)
                || error.getClass().getSimpleName().contains("Timeout")) {
            row.put("status", "UNKNOWN");
            row.put("detail", "no answer within " + timeoutMs + " ms");
        } else if (hasCause(error, java.net.ConnectException.class)) {
            row.put("status", "DOWN");
            row.put("detail", "connection refused");
        } else {
            row.put("status", "UNKNOWN");
            row.put("detail", "probe failed: " + error.getClass().getSimpleName());
        }
        return row;
    }

    private static boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            if (type.isInstance(t)) {
                return true;
            }
            if (t == t.getCause()) {
                break;
            }
        }
        return false;
    }
}
