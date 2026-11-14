package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The retry filter's SECOND trigger — {@code setExceptions(IOException, TimeoutException)} — on a real
 * socket (SC-33). {@link GatewayEdgePolicyTest} grades the FIRST trigger ({@code setStatuses(503)}): a GET
 * is replayed once, a POST never. But a backend that dies mid-call raises a transport exception, not a 503,
 * and that path's method gate had never been measured on a wire.
 *
 * <p>Measured first with a throwaway 5-round probe (2026-11-11), then confirmed against the library source:
 * Netty surfaces {@code reactor.netty.http.client.PrematureCloseException}, which DOES extend
 * {@code java.io.IOException}, so this exception trigger is live. And
 * {@code RetryGatewayFilterFactory.RetryConfig}'s exception predicate applies the SAME
 * {@code setMethods(GET)} gate as its status predicate. The stable, graded invariants:
 *
 * <ul>
 *   <li><b>A write is never replayed on a transport failure.</b> A dropped POST reaches the backend exactly
 *       ONCE, every round — the method gate is what keeps "one click" from becoming "two publications".
 *       {@code hasSize(1)} proves both that the request truly hit the wire (not refused at the door) and
 *       that no second attempt followed.
 *   <li><b>A retry never amplifies a GET beyond one extra attempt.</b> The backend sees at most 2 wire
 *       attempts, and the caller always gets an HONEST answer — either a self-healed 200 or the fallback's
 *       503, never an unhandled 500 or a hung socket.
 * </ul>
 *
 * <p><b>Deliberately NOT asserted</b> (measured unstable; the same territory as ADR-0101): the GET leg's
 * exact wire count and final status. Across rounds a dropped GET lands on wire=1/2 and status=200/503,
 * because Reactor Netty's close, the breaker fallback committing a 503, and the retry racing to replay all
 * interleave — the log even shows the known "ServerHttpResponse already committed (503)" noise. Pinning
 * either value would be a flaky, fake-green test. The DETERMINISTIC "GET replays once" proof belongs to
 * {@link GatewayEdgePolicyTest}'s status-trigger leg; this class owns the exception-trigger's WRITE-SAFETY
 * proof. Repeating rounds here grades stability itself, not a lucky single run.
 *
 * <p><b>A full-suite flake was found and fixed (2026-11-11, SC-38):</b> under the whole 110-test context the
 * GET leg occasionally read wire=0 — the blocking call returned on the fallback's committed 503 BEFORE the
 * retry's 2nd attempt was recorded, so an instant {@code paths().size()} read saw fewer attempts than would
 * ultimately land. It was NOT a new regression (the class passed 3/3 in isolation); it was a read race the
 * loose {@code isBetween(1,2)} still assumed away. The wire is now read via a bounded
 * {@link StubUpstream#awaitPathsAtLeast(int, long)} grace (wait for the floor, then grade the upper bound),
 * keeping BOTH invariants — the call truly hit the backend and retry did not amplify it — without pinning a
 * value that races the fallback. The bound is a read grace, never the thing under test.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            // Keep the breaker CLOSED so wire counts reflect ONLY the retry method gate, not breaker OPEN state.
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=100",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=100",
            "logging.level.root=warn"
        })
class GatewayRetryTransportWiringTest {

    private static final int ROUNDS = 6;
    private static StubUpstream upstream;

    @DynamicPropertySource
    static void advertiseTheStub(DynamicPropertyRegistry registry) {
        upstream = StubUpstream.start();
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-api[0].uri", upstream::uri);
    }

    @AfterAll
    static void stopStub() {
        if (upstream != null) {
            upstream.stop();
        }
    }

    @LocalServerPort
    private int port;
    private WebTestClient client;

    @Autowired
    CircuitBreakerRegistry breakers;

    @BeforeEach
    void reset() {
        for (CircuitBreaker breaker : breakers.getAllCircuitBreakers()) {
            breaker.reset();
        }
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    /** Drop the FIRST wire attempt; a self-recovering outage so a retry, if allowed, can succeed. */
    private int postWithOneDrop() {
        upstream.reset();
        upstream.clearPaths();
        upstream.dropNextConnections(1);
        return client.post()
                .uri("/api/publications")
                .header("Content-Type", "application/json")
                .bodyValue("{\"title\":\"Harbour\"}")
                .exchange()
                .expectBody()
                .returnResult()
                .getStatus()
                .value();
    }

    private int getWithOneDrop() {
        upstream.reset();
        upstream.clearPaths();
        upstream.dropNextConnections(1);
        return client.get()
                .uri("/api/publications?limit=1")
                .exchange()
                .expectBody()
                .returnResult()
                .getStatus()
                .value();
    }

    @Test
    void aWriteIsNeverReplayedWhenTheConnectionDiesMidCall() {
        for (int i = 0; i < ROUNDS; i++) {
            int status = postWithOneDrop();
            assertThat(upstream.paths())
                    .as("round %d: a dropped POST must reach the backend exactly ONCE, never be replayed", i)
                    .hasSize(1);
            assertThat(status)
                    .as("round %d: the dropped write answers an honest 503, not a fake success", i)
                    .isEqualTo(503);
        }
    }

    @Test
    void aTransportFailureIsRetriedAtMostOnceAndAlwaysAnswersHonestly() {
        int honestAnswers = 0;
        for (int i = 0; i < ROUNDS; i++) {
            int status = getWithOneDrop();
            // The retry's 2nd attempt can land AFTER the fallback committed 503 (ADR-0101's already-committed
            // race). Read the wire only once it is stable: wait for the 1st attempt with a BOUNDED grace, then
            // grade the upper bound. This keeps both invariants — the call really reached the backend (>=1)
            // and retry never amplified it (>2) — without pinning the read to a response/fallback race.
            int wire = upstream.awaitPathsAtLeast(1, 250);
            assertThat(wire)
                    .as("round %d: the call reached the backend (>=1) and retry=1 caps it at 2 (no amplification)", i)
                    .isBetween(1, 2);
            assertThat(status)
                    .as("round %d: a dropped GET must self-heal to 200 or answer an honest 503", i)
                    .isIn(200, 503);
            honestAnswers++;
        }
        assertThat(honestAnswers)
                .as("every round must land on an honest answer — never a 500, 429 or a hung socket")
                .isEqualTo(ROUNDS);
    }
}
