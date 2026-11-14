package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

/**
 * The Resilience4j <b>bulkhead</b> — the fourth elasticity primitive (retry / timeout / circuit-breaker /
 * bulkhead), the one §SC 第二十六片 deliberately left unwired because concurrent in-flight assertions looked
 * flaky on this machine. SC-37 closes that gap with a DETERMINISTIC fixture instead of a timing race.
 *
 * <p><b>What was actually true (source + probe, 2026-11-11):</b> the gateway never "lacked" a bulkhead.
 * Spring Cloud's reactive circuit-breaker factory auto-registers a {@code ReactiveResilience4jBulkheadProvider}
 * and wraps every route's Mono in a {@code SemaphoreBulkhead} — but on resilience4j's silent default of
 * {@code DEFAULT_MAX_CONCURRENT_CALLS = 25}, with no configuration, no operator readout, and no wire proof of
 * what happens when it fills. This class turns that silent default into a measured fact. The important
 * distinction it grades: a bulkhead refusal is {@code BulkheadFullException} from INSIDE the circuit (the
 * backend is healthy), NOT a breaker's {@code CallNotPermitted} (the backend is failing). Those are different
 * failures and must not be confused — §SC-24/29 own the breaker half; this class owns capacity.
 *
 * <p><b>Deterministic occupancy, no pinning a race:</b> {@link StubUpstream#holdNext(int)} parks the first N
 * backend handler threads until the test releases them, and {@link StubUpstream#awaitHeld(long)} PROVES all N
 * are genuinely in flight before the next call is sent. There is no sleep-tuning, no "wait and hope two
 * requests overlap". The 3rd call is sent only after occupancy is a fact. The stub's wait is bounded, and
 * {@code @AfterEach} always releases, so a red assertion can never pin a non-daemon thread and hang the JVM.
 *
 * <p><b>Why WebClient and not WebTestClient:</b> {@code WebTestClient.exchange()} is blocking, so it cannot
 * put two requests in flight from one thread — the thing a semaphore bulkhead measures. The concurrent legs
 * use a non-blocking {@link WebClient} subscribed before any assertion; each round collects its responses.
 *
 * <p><b>Deliberately NOT asserted</b> (unstable, same territory as ADR-0101/0106): the exact order in which
 * the two released callers complete, and per-round latency. Graded invariants only: refusal cause, wire count,
 * honest 503, and recovery. Repeating {@link #ROUNDS} rounds grades stability itself, not one lucky overlap.
 *
 * <p><b>No production change:</b> Spring Cloud already wires the bulkhead correctly; refusing a call when
 * all slots are full is the intended shedding behaviour. This class makes three safety properties wire facts
 * that a config-only default could never prove.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            // 2 slots on the SAME bulkhead id the route uses (create(id)->create(id,id), id = setName(service)).
            "resilience4j.bulkhead.instances.nexus-api.max-concurrent-calls=2",
            "resilience4j.bulkhead.instances.nexus-api.max-wait-duration=0",
            // Keep the breaker CLOSED throughout so a refusal is BulkheadFull, not CallNotPermitted. This is
            // the whole point: capacity shedding is not a backend failure and must not be graded as one.
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=100",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=100",
            // Longer than the stub's bounded hold, so released callers finish before the timelimiter cuts them.
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=8s",
            "logging.level.root=warn"
        })
class GatewayBulkheadWiringTest {

    private static final int ROUNDS = 3;
    private static final int SLOTS = 2;
    private static final String BULKHEAD_FULL_CAUSE = "io.github.resilience4j.bulkhead.BulkheadFullException";
    private static StubUpstream upstream;

    @DynamicPropertySource
    static void advertiseTheStub(DynamicPropertyRegistry registry) {
        // Concurrent dispatch: two held requests must occupy two threads at the same time.
        upstream = StubUpstream.startConcurrent();
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
    private WebClient webClient;

    @Autowired
    CircuitBreakerRegistry breakers;

    @BeforeEach
    void reset() {
        for (CircuitBreaker breaker : breakers.getAllCircuitBreakers()) {
            breaker.reset();
        }
        upstream.reset();
        upstream.clearPaths();
        webClient = WebClient.create("http://127.0.0.1:" + port);
    }

    @AfterEach
    void alwaysRelease() {
        upstream.release(); // a red assertion must never leave an in-flight handler parked
    }

    private Mono<ResponseEntity<String>> post(String title) {
        // exchangeToMono, not retrieve(): a 503 comes back as a ResponseEntity whose BODY we grade,
        // instead of throwing WebClientResponseException.
        return webClient.post()
                .uri("/api/publications")
                .header("Content-Type", "application/json")
                .bodyValue("{\"title\":\"" + title + "\"}")
                .exchangeToMono((r) -> r.toEntity(String.class));
    }

    /**
     * Occupy every bulkhead slot with a real in-flight backend call, and prove it. Returns the latch the
     * caller must await AFTER {@link StubUpstream#release()} to confirm the held calls completed.
     */
    private CountDownLatch occupyEverySlot() throws InterruptedException {
        upstream.holdNext(SLOTS);
        CountDownLatch done = new CountDownLatch(SLOTS);
        for (int i = 0; i < SLOTS; i++) {
            post("held-" + i).subscribe(
                    (r) -> done.countDown(),
                    (e) -> done.countDown());
        }
        assertThat(upstream.awaitHeld(5))
                .as("all %d backend calls must genuinely be in flight before the saturation test", SLOTS)
                .isTrue();
        assertThat(upstream.paths())
                .as("both held calls reached the wire — the bulkhead slots are occupied by real requests")
                .hasSize(SLOTS);
        return done;
    }

    private static void assertHonestCapacityRefusal(ResponseEntity<String> refused) {
        assertThat(refused.getStatusCode().value())
                .as("a saturated bulkhead sheds load with an HONEST 503, never an empty 200 or a 500")
                .isEqualTo(503);
        String body = refused.getBody();
        assertThat(body).contains("\"error\":\"service_unavailable\"").contains(BULKHEAD_FULL_CAUSE);
    }

    @Test
    void aSaturatedBulkheadRefusesTheNextCallWithItsOwnCauseAndDoesNotAmplifyTheWire() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            CountDownLatch held = occupyEverySlot();
            int wireUnderSaturation = upstream.paths().size();

            ResponseEntity<String> refused = post("over-capacity").block(Duration.ofSeconds(8));

            assertHonestCapacityRefusal(refused);
            assertThat(upstream.paths())
                    .as("round %d: the refused call never reached the backend — shedding happens at the door, "
                            + "not by making an already-full backend do more work", round)
                    .hasSize(wireUnderSaturation);
            assertThat(breakers.find("nexus-api").orElseThrow().getState())
                    .as("round %d: a capacity refusal is NOT a backend failure — the breaker stays CLOSED", round)
                    .isEqualTo(CircuitBreaker.State.CLOSED);

            upstream.release();
            assertThat(held.await(6, TimeUnit.SECONDS))
                    .as("round %d: both admitted calls complete once slots free up", round)
                    .isTrue();
            upstream.clearPaths();
        }
    }

    @Test
    void freeingTheSlotsHealsTheDoorWithoutRestart() throws Exception {
        CountDownLatch held = occupyEverySlot();

        // While saturated, another call is refused...
        assertHonestCapacityRefusal(post("during").block(Duration.ofSeconds(8)));

        // ...then the backend calls finish and a fresh call is admitted again — no config reload, no restart.
        upstream.release();
        assertThat(held.await(6, TimeUnit.SECONDS)).isTrue();
        upstream.clearPaths();

        ResponseEntity<String> after = post("after").block(Duration.ofSeconds(8));
        assertThat(after.getStatusCode().value())
                .as("once the bulkhead has room again the door serves normally")
                .isEqualTo(200);
        assertThat(upstream.paths())
                .as("the recovered call actually reached the backend (not a cached empty answer)")
                .hasSize(1);
    }

    @Test
    void theRefusalIsDistinctFromAnOpenCircuit() throws Exception {
        // Guards the semantics boundary: BulkheadFullException (capacity, backend healthy) must NOT be
        // reported as CallNotPermitted (breaker tripped by a failing backend). If they collapse, an operator
        // reading the fallback cause would chase a backend outage that never happened.
        CountDownLatch held = occupyEverySlot();
        String saturatedBody = post("over-capacity").block(Duration.ofSeconds(8)).getBody();
        assertThat(saturatedBody).contains(BULKHEAD_FULL_CAUSE).doesNotContain("CallNotPermitted");
        upstream.release();
        assertThat(held.await(6, TimeUnit.SECONDS)).isTrue();
    }
}
