package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * A backend that dies <b>mid-response-body</b> — the fourth backend-failure shape, after a 5xx
 * ({@link GatewayRoutingTest}), a connection refusal ({@link GatewayCircuitOpenWiringTest}), and a
 * connection drop before any byte ({@link GatewayRetryTransportWiringTest}). SC-38 grades the one that is
 * easiest to lie about: the backend sends a 200 + headers + a PREFIX of the body, then closes with its
 * declared {@code Content-Length} unmet.
 *
 * <p><b>Measured first with a throwaway 6-round probe (2026-11-11), then pinned here.</b> The dangerous
 * outcome would be a "successful" answer carrying a truncated body — a caller sees a half-JSON that parses
 * to nothing, or an empty list, and reports "no content" when the truth is "the backend died". §159 forbids
 * exactly that shape for a full outage; this class extends the honesty rule to a PARTIAL response. The probe
 * read, consistently across GET and POST: the caller gets a CONNECTION-LEVEL failure —
 * {@code PrematureCloseException: Connection prematurely closed DURING response} — never a 200 with a cut
 * body, and the backend sees exactly one wire attempt.
 *
 * <p><b>HONEST BOUND (why the caller sees an exception, not a clean 503):</b> by the time the body breaks, the
 * gateway has already forwarded the 200 status + headers downstream. Rewriting them to 503 would hit
 * {@code ServerHttpResponse already committed} — the same boundary ADR-0101 records for the breaker fallback
 * racing a written response. The platform therefore cannot promise an honest 503 here; what it CAN promise,
 * and what is graded, is that it does NOT pass off a truncated stream as success. The signal is the premature
 * close, which is the truth of what happened. Do not "improve" this into a claimed 503 that the code cannot
 * deliver. If a clean 503 is ever required, it needs a different design (full body buffering before the
 * response is committed), which is a larger production change, out of scope here.
 *
 * <p><b>Deliberately NOT asserted</b> (unstable): per-round latency (first cold connect ~1.2 s, warm ~30-50 ms)
 * and the exact wrapper exception type at the caller (reactor may surface {@code PrematureCloseException} bare
 * or wrapped in {@code Exceptions$ReactiveException}, depending on how the response is consumed). The graded
 * invariant is the MEANING: no successful response, real premature-close signal, no wire amplification.
 *
 * <p><b>No production change.</b> There is no defect — the gateway already refuses to manufacture a success
 * from a broken body. This class turns that safety property into a wire invariant, so a future change that
 * "helpfully" answers 200 with a half body turns it red.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            // Comfortably above the stub's break-up; the failure is a premature close, not a timeout.
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=6s",
            // Breaker CLOSED so wire counts reflect truncation handling, not OPEN-state fail-fast.
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=100",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=100",
            "logging.level.root=warn"
        })
class GatewayTruncatedResponseWiringTest {

    private static final int ROUNDS = 3;
    private static StubUpstream upstream;

    @DynamicPropertySource
    static void advertiseTheStub(DynamicPropertyRegistry registry) {
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

    @BeforeEach
    void reset() {
        upstream.reset();
        upstream.clearPaths();
        webClient = WebClient.create("http://127.0.0.1:" + port);
    }

    /** What the caller observed for one truncated call — either a (wrong) response or the (right) failure. */
    private record Outcome(String kind, int status, String body) {}

    private Outcome call(boolean get) {
        try {
            var spec = (get
                    ? webClient.get().uri("/api/publications")
                    : webClient.post().uri("/api/publications")
                            .header("Content-Type", "application/json").bodyValue("{\"title\":\"x\"}"));
            ResponseEntity<String> r = spec.exchangeToMono((resp) -> resp.toEntity(String.class))
                    .block(Duration.ofSeconds(10));
            return new Outcome("response", r.getStatusCode().value(), r.getBody());
        } catch (Throwable e) {
            // Walk the cause chain: reactor may wrap PrematureCloseException in Exceptions$ReactiveException.
            StringBuilder chain = new StringBuilder();
            for (Throwable t = e; t != null; t = t.getCause()) {
                chain.append(t.getClass().getName()).append(' ').append(String.valueOf(t.getMessage())).append(" | ");
            }
            return new Outcome("failure", -1, chain.toString());
        }
    }

    private void assertNotAManufacturedSuccess(Outcome o) {
        assertThat(o.kind())
                .as("a mid-body break must NEVER come back as a (truncated) successful response")
                .isEqualTo("failure");
        assertThat(o.body())
                .as("the caller's failure must carry the real premature-close signal, not a fabricated cause")
                .contains("PrematureCloseException")
                .contains("DURING response");
    }

    @Test
    void aTruncatedGetIsNeverPassedOffAsASuccessAndIsNotRetried() {
        upstream.truncateResponses();
        for (int i = 0; i < ROUNDS; i++) {
            upstream.clearPaths();
            Outcome o = call(true);
            assertNotAManufacturedSuccess(o);
            assertThat(upstream.paths())
                    .as("round %d: a GET whose response body dies is NOT replayed — the backend heard one call", i)
                    .hasSize(1);
        }
    }

    @Test
    void aTruncatedWriteIsNeverReplayedAndNeverFabricatesSuccess() {
        upstream.truncateResponses();
        for (int i = 0; i < ROUNDS; i++) {
            upstream.clearPaths();
            Outcome o = call(false);
            assertNotAManufacturedSuccess(o);
            assertThat(upstream.paths())
                    .as("round %d: a write whose response body dies reached the backend exactly once", i)
                    .hasSize(1);
        }
    }

    @Test
    void aHealthyAnswerIsStillARealSuccessSoTheFixtureCannotLie() {
        // Guards the fixture: if truncation were stuck "on" or the stub were permanently broken, this fails.
        upstream.reset();
        upstream.clearPaths();
        Outcome o = call(true);
        assertThat(o.kind()).isEqualTo("response");
        assertThat(o.status()).isEqualTo(200);
        assertThat(o.body()).contains("\"from\":\"stub-upstream\"");
        assertThat(upstream.paths()).hasSize(1);
    }
}
