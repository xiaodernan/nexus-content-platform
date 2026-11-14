package dev.nexus.gateway;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
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
 * <p>SC-37 adds a fourth shape: hold the first N requests IN FLIGHT until the test releases them. That is
 * what grades a semaphore bulkhead, whose whole semantics are "how many calls may be concurrently in
 * flight" — a thing a serial or instant-answer stub cannot exercise. The wait is BOUNDED: a red assertion
 * that forgets to release must never pin a non-daemon dispatch thread and hang the JVM on exit (the failure
 * mode a 9-minute-killed probe taught us in SC-36).
 *
 * <p>It is NOT a fake nexus-api: it publishes no domain data and no test asserts a domain fact against it.
 * Every assertion is about what the GATEWAY did with the answer.
 */
final class StubUpstream {

    /** Safety net: a parked handler resumes on its own even if the test never calls {@link #release()}. */
    private static final long HOLD_BOUND_SECONDS = 5;

    private final HttpServer server;
    // SC-34 — only startConcurrent() sets this. A plain HttpServer dispatches requests SERIALLY on one
    // thread, so a slow (delay()/sleep) request blocks every later request from even reaching handle() —
    // paths.add() never runs and wire counts read 0, which is a fixture lie, not a gateway fact. A cached
    // pool makes concurrent/in-flight requests real. Null for the default start(), whose behaviour is
    // deliberately unchanged (all existing wire tests keep their measured semantics).
    private java.util.concurrent.ExecutorService executor;
    private final List<String> paths = new CopyOnWriteArrayList<>();
    private final List<Map<String, List<String>>> requestHeaders = new CopyOnWriteArrayList<>();
    private final List<String> forwardedHosts = new CopyOnWriteArrayList<>();
    private final List<String> probeHeaders = new CopyOnWriteArrayList<>();
    private final List<String> originalUrls = new CopyOnWriteArrayList<>();
    private final java.util.concurrent.atomic.AtomicInteger failuresLeft =
            new java.util.concurrent.atomic.AtomicInteger();
    // SC-33 — like failNextRequests but at the CONNECTION layer: the next N requests are dropped mid-call
    // (a close with no response byte), which the gateway sees as a transport exception, NOT a 503 status.
    // This isolates the retry filter's setExceptions(IOException) trigger from its setStatuses(503) trigger.
    private final java.util.concurrent.atomic.AtomicInteger dropsLeft =
            new java.util.concurrent.atomic.AtomicInteger();
    // SC-37 — deterministic in-flight occupancy. holdNext(n) parks the next n handler threads on
    // holdRelease; holdArrived counts down as each one actually parks, so a test can PROVE occupancy
    // before sending the call that should be refused. Both latches are replaced per holdNext(), and the
    // await in handle() is bounded, so no thread can be left parked by a failing assertion.
    private final java.util.concurrent.atomic.AtomicInteger holdRemaining =
            new java.util.concurrent.atomic.AtomicInteger();
    private volatile java.util.concurrent.CountDownLatch holdArrived =
            new java.util.concurrent.CountDownLatch(0);
    private volatile java.util.concurrent.CountDownLatch holdRelease;

    // SC-38 — truncate the RESPONSE BODY mid-stream: declare a Content-Length larger than what is written,
    // then close. Unlike /drop (no response byte at all → transport IOException), the gateway here has
    // already received the status + headers and part of the body before the socket dies. That is a different
    // failure: the response may already be committed downstream, so "answer 503" is no longer available.
    private volatile boolean truncateBody;

    private volatile int status = 200;
    private volatile int failureStatus = 503;
    private volatile String body = "{\"publications\":[],\"from\":\"stub-upstream\"}";
    private volatile long delayMs;
    // SC-29 — when set, EVERY request is dropped mid-call until stopDropping(). Unlike the permanent /drop
    // path, this is a RECOVERABLE outage: the backend can come back, which is what half-open probing needs.
    private volatile boolean dropConnections;

    private StubUpstream(HttpServer server) {
        this.server = server;
    }

    /** Default serial dispatch — every existing wire test uses this; do not change its semantics. */
    static StubUpstream start() {
        return start(null);
    }

    /**
     * SC-34 — concurrent dispatch, for tests that keep a request IN FLIGHT (a real sleep past the gateway's
     * timelimiter) while other requests arrive. Without this, a sleeping handler monopolises the sole
     * dispatch thread and later requests never reach {@link #handle()}, so wire counts falsely read 0.
     * SC-37 also requires it: two held requests must occupy two threads at the same time.
     */
    static StubUpstream startConcurrent() {
        return start(java.util.concurrent.Executors.newCachedThreadPool());
    }

    private static StubUpstream start(java.util.concurrent.ExecutorService executor) {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            StubUpstream stub = new StubUpstream(server);
            stub.executor = executor;
            server.createContext("/", stub::handle);
            if (executor != null) {
                server.setExecutor(executor);
            }
            server.start();
            return stub;
        } catch (IOException e) {
            throw new IllegalStateException("could not start the stub upstream", e);
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().toString();
        paths.add(path);
        requestHeaders.add(new java.util.LinkedHashMap<>(exchange.getRequestHeaders()));
        String forwardedHost = exchange.getRequestHeaders().getFirst("X-Forwarded-Host");
        forwardedHosts.add(forwardedHost == null ? "" : forwardedHost);
        String originalUrl = exchange.getRequestHeaders().getFirst("X-Nexus-Original-URL");
        originalUrls.add(originalUrl == null ? "" : originalUrl);
        probeHeaders.add(String.valueOf(exchange.getRequestHeaders().getFirst("X-Nexus-Gateway")));
        try {
            // SC-33 — a BOUNDED connection-layer drop: the first N attempts die before any response byte.
            // Unlike the permanent /drop path or SC-29's manual toggle, this recovers on its own after N, so
            // a probe can watch the retry act on a transport failure and then succeed. paths.add() above
            // still counts it — that is exactly the wire count the test needs (was the write replayed?).
            int remainingDrops = dropsLeft.getAndUpdate((n) -> n > 0 ? n - 1 : 0);
            if (remainingDrops > 0) {
                exchange.close();
                return;
            }
            // SC-37 — park the first N requests IN FLIGHT. paths.add() above already put them on the wire;
            // the latch then keeps them occupying bulkhead concurrent-call slots until release() (or the
            // bound). A request past N falls straight through and answers normally, so "the bulkhead refused
            // it before the wire" shows up as a wire count that stays at N: a refusal that never reached the
            // backend cannot be hidden by an instant-answer stub.
            java.util.concurrent.CountDownLatch gate = this.holdRelease;
            if (gate != null && holdRemaining.getAndUpdate((n) -> n > 0 ? n - 1 : 0) > 0) {
                java.util.concurrent.CountDownLatch arrived = this.holdArrived;
                arrived.countDown();
                try {
                    gate.await(HOLD_BOUND_SECONDS, java.util.concurrent.TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            // SC-29 — a recoverable mid-call drop, controlled by the test. Checked before the permanent
            // /drop path so the same socket can first open a breaker and then prove it closes again.
            if (dropConnections) {
                exchange.close();
                return;
            }
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
            if (truncateBody || path.startsWith("/truncate")) {
                // SC-38 — send a 200 with a declared body length, write only a PREFIX, then close. The peer
                // sees a committed response header and a premature end of body — not a connection refusal
                // (that is /drop), but a stream that dies after the gateway may have started forwarding.
                byte[] full = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, full.length + 4096L); // claim MORE than we will write
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(full, 0, Math.max(1, full.length / 2));
                    out.flush();
                } // close with the declared length unmet → premature body EOF on the wire
                return;
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

    /**
     * Wait (bounded) until the backend has recorded at least {@code n} requests, or the deadline elapses.
     *
     * <p>Why this exists: with retry + breaker fallback, the SECOND wire attempt can land just AFTER the
     * fallback has already committed a 503 to the caller. A test that reads {@link #paths()} the instant the
     * blocking HTTP call returns may therefore see fewer attempts than will ultimately hit the wire. Reading
     * a stable value (wait for the floor, or give up on a bound) grades the OUTCOME, not a read race. The
     * bound is generous and never the thing under test — it only stops a genuinely stalled wire from hanging.
     */
    int awaitPathsAtLeast(int n, long millis) {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(millis);
        while (paths.size() < n && System.nanoTime() < deadline) {
            try {
                Thread.sleep(5L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return paths.size();
    }

    /** Every request header map the backend actually received, one entry per request. */
    List<Map<String, List<String>>> requestHeaders() {
        return List.copyOf(requestHeaders);
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
        requestHeaders.clear();
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

    /** SC-33 — drop the next {@code times} connections with no response (a transport error, not a 503),
     * then normal answers resume. Bounded and self-recovering so a single test can observe retry + success. */
    void dropNextConnections(int times) {
        this.dropsLeft.set(Math.max(0, times));
    }

    /**
     * SC-37 — park the next {@code n} requests IN FLIGHT until {@link #release()} (or the bounded wait).
     * Requires {@link #startConcurrent()}: a serial dispatcher cannot hold two requests at once. Pair with
     * {@link #awaitHeld(long)} to prove occupancy BEFORE sending the call that should be refused.
     */
    void holdNext(int n) {
        int count = Math.max(0, n);
        this.holdRemaining.set(count);
        this.holdArrived = new java.util.concurrent.CountDownLatch(count);
        this.holdRelease = new java.util.concurrent.CountDownLatch(1);
    }

    /** True when all requested in-flight requests actually parked — a prerequisite for a valid grading. */
    boolean awaitHeld(long seconds) {
        try {
            return this.holdArrived.await(seconds, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /** Let any parked requests resume. Idempotent; safe from teardown even if nothing is held. */
    void release() {
        java.util.concurrent.CountDownLatch gate = this.holdRelease;
        if (gate != null) {
            gate.countDown();
        }
    }

    /** SC-38 — make EVERY response die mid-body (status + headers sent, declared length unmet). */
    void truncateResponses() {
        this.truncateBody = true;
    }

    /** Every answer waits this long, so a probe's timeout can be measured against a real slow socket. */
    void delay(long millis) {
        this.delayMs = Math.max(0, millis);
    }

    /** SC-29 — start dropping every request mid-call; a recoverable outage the test can end at will. */
    void startDropping() {
        this.dropConnections = true;
    }

    /** SC-29 — the backend is back; requests answer normally again. */
    void stopDropping() {
        this.dropConnections = false;
    }

    void reset() {
        release(); // never leave a parked handler behind when a test re-arms the stub
        this.holdRemaining.set(0);
        this.holdRelease = null;
        this.holdArrived = new java.util.concurrent.CountDownLatch(0);
        this.status = 200;
        this.failureStatus = 503;
        this.failuresLeft.set(0);
        this.dropsLeft.set(0);
        this.delayMs = 0;
        this.dropConnections = false;
        this.truncateBody = false;
        this.body = "{\"publications\":[],\"from\":\"stub-upstream\"}";
    }

    void stop() {
        release();
        server.stop(0);
        if (executor != null) {
            executor.shutdownNow();
        }
    }
}
