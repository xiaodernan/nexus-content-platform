package dev.nexus.gateway;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A real HTTP server standing in for {@code nexus-api}, on a port the OS chose.
 *
 * <p>Why a real socket and not a mocked {@code WebClient}: the thing under test is a gateway, and a gateway
 * that routes correctly to a mock has not been shown to put bytes on a wire. This stub records the path it
 * actually received (so {@code StripPrefix} is graded on the request the backend saw, not on the URL the
 * test typed) and can answer a chosen status, hang, or drop the connection — the three ways a real backend
 * fails that a gateway must tell apart.
 *
 * <p>It is NOT a fake nexus-api: it publishes no domain data and no test asserts a domain fact against it.
 * Every assertion is about what the GATEWAY did with the answer.
 */
final class StubUpstream {

    private final HttpServer server;
    private final List<String> paths = new CopyOnWriteArrayList<>();
    private final List<String> forwardedHosts = new CopyOnWriteArrayList<>();
    private final List<String> probeHeaders = new CopyOnWriteArrayList<>();
    private final List<String> originalUrls = new CopyOnWriteArrayList<>();
    private final java.util.concurrent.atomic.AtomicInteger failuresLeft =
            new java.util.concurrent.atomic.AtomicInteger();

    private volatile int status = 200;
    private volatile int failureStatus = 503;
    private volatile String body = "{\"publications\":[],\"from\":\"stub-upstream\"}";
    private volatile long delayMs;

    private StubUpstream(HttpServer server) {
        this.server = server;
    }

    static StubUpstream start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            StubUpstream stub = new StubUpstream(server);
            server.createContext("/", stub::handle);
            server.start();
            return stub;
        } catch (IOException e) {
            throw new IllegalStateException("could not start the stub upstream", e);
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().toString();
        paths.add(path);
        String forwardedHost = exchange.getRequestHeaders().getFirst("X-Forwarded-Host");
        forwardedHosts.add(forwardedHost == null ? "" : forwardedHost);
        String originalUrl = exchange.getRequestHeaders().getFirst("X-Nexus-Original-URL");
        originalUrls.add(originalUrl == null ? "" : originalUrl);
        probeHeaders.add(String.valueOf(exchange.getRequestHeaders().getFirst("X-Nexus-Gateway")));
        try {
            if (delayMs > 0) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (path.startsWith("/drop")) {
                // Close without a response: what a backend that dies mid-call looks like from the wire.
                exchange.close();
                return;
            }
            if (path.startsWith("/slow")) {
                try {
                    Thread.sleep(4000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            int remainingFailures = failuresLeft.getAndUpdate((n) -> n > 0 ? n - 1 : 0);
            int replyStatus = remainingFailures > 0 ? failureStatus : status;
            if (remainingFailures > 0) {
                exchange.getResponseHeaders().add("X-Stub-Failure", "1");
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("X-Stub-Upstream", "nexus-api");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(replyStatus, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        } finally {
            exchange.close();
        }
    }

    int port() {
        return server.getAddress().getPort();
    }

    String uri() {
        return "http://127.0.0.1:" + port();
    }

    List<String> paths() {
        return List.copyOf(paths);
    }

    /** The {@code X-Forwarded-Host} the backend actually received, one entry per request. */
    List<String> forwardedHosts() {
        return List.copyOf(forwardedHosts);
    }

    List<String> probeHeaders() {
        return List.copyOf(probeHeaders);
    }

    /** The {@code X-Nexus-Original-URL} the backend received — the caller-facing base the gateway promises. */
    List<String> originalUrls() {
        return List.copyOf(originalUrls);
    }

    void clearPaths() {
        paths.clear();
        forwardedHosts.clear();
        probeHeaders.clear();
        originalUrls.clear();
    }

    void answer(int status, String body) {
        this.status = status;
        this.body = body;
    }

    /** The next {@code times} responses answer {@code status}, then normal answers resume. */
    void failNextRequests(int failureStatus, int times) {
        this.failureStatus = failureStatus;
        this.failuresLeft.set(Math.max(0, times));
    }

    /** Every answer waits this long, so a probe's timeout can be measured against a real slow socket. */
    void delay(long millis) {
        this.delayMs = Math.max(0, millis);
    }

    void reset() {
        this.status = 200;
        this.failureStatus = 503;
        this.failuresLeft.set(0);
        this.delayMs = 0;
        this.body = "{\"publications\":[],\"from\":\"stub-upstream\"}";
    }

    void stop() {
        server.stop(0);
    }
}