package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;

/**
 * SC-36 — the shared limiter's SELF-OWNED deadline, graded on a wire: when the backend has taken the connection
 * but its answer NEVER comes back, the gateway must turn "no answer" into an error ON ITS OWN DEADLINE and let
 * the request through (fail-open), rather than welding the door shut.
 *
 * <p><b>The命门 (SC-36):</b> fail-open lives in {@link RateLimitFilter}'s {@code onErrorResume}, which can only
 * fire when the backend eventually produces an ERROR. A backend that neither emits nor errors (a hung command,
 * an exhausted pool waiting for a slot, a Lua script stuck on the server) leaves that path dormant and hangs the
 * request at the limiter — the exact "degraded limiter → full outage" the class comment promises to prevent.
 * Before SC-36 the only bound was Lettuce's own command timeout, a CLIENT detail. Now {@link
 * RedisRateLimitBackend#tryAcquire} applies {@code timeout(backendTimeout)} so the error arrives on a deadline
 * the DEPLOYMENT owns.
 *
 * <p><b>Why a controlled {@code Flux.never()} source and not a real socket here:</b> this grades the limiter's
 * OWN deadline, so the network leg must be removed as a confounder. A real Lettuce TCP connect-blackhole was
 * measured first with throwaway probes (2026-11-11): the connect-phase cancel is not interruptible by a Reactor
 * timer, so a pure connect blackhole is bounded by Lettuce's {@code connect-timeout}, not this deadline (that
 * boundary is recorded honestly in ADR-0108). The command-phase "connection up, answer never returns" shape —
 * which IS the backend's own deadline to bound — is reproduced faithfully and deterministically by a Redis
 * template that returns {@code Flux.never()}: no emit, no error, forever. Together with SC-35's real
 * connection-refused probe, the two wire tests cover the fault spectrum without a flaky timing race.
 *
 * <p><b>Stable invariants graded:</b> (1) the door stays open — honest backend 200, not 500/429/hang; (2) the
 * request crosses to the backend exactly once — a limiter failure neither blocks nor replays; (3) the fail-open
 * is reported, not silent; (4) a LOOSE ceiling catches a genuine hang. The exact latency is deliberately NOT
 * pinned (scheduler jitter is a machine function, not a contract).
 *
 * <p>This test grades the SC-36 production change in {@link RedisRateLimitBackend}; it makes no further change.
 */
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=true",
            "nexus.gateway.rate-limit.backend=redis",
            // The gateway's own deadline — the thing under test. Well under the loose hang ceiling below.
            "nexus.gateway.rate-limit.backend-timeout-ms=400",
            "logging.level.root=warn"
        })
class GatewayRedisBackendTimeoutWiringTest {

    private static final int ROUNDS = 3;
    /** A loose ceiling that catches a genuine HANG, not a grade on the exact 400ms deadline. */
    private static final long HANG_CEILING_MS = 8_000L;

    /**
     * A Redis template whose command answer NEVER arrives (no item, no error). The primary bean displaces the
     * auto-configured Lettuce template in this context, so {@code GatewayConfig} wires this backend with the
     * SC-36 deadline and nothing else. Deterministic and network-free — the confounder is removed on purpose.
     */
    @TestConfiguration
    static class NeverAnswersRedis {
        @Bean
        @Primary
        ReactiveStringRedisTemplate reactiveStringRedisTemplate() {
            ReactiveStringRedisTemplate template = mock(ReactiveStringRedisTemplate.class);
            doReturn(Flux.never()).when(template).execute(any(), anyList(), anyList());
            return template;
        }
    }

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

    @BeforeEach
    void reset() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(12))
                .build();
    }

    @Test
    void aBackendThatNeverAnswersCannotWeldTheDoorShut(CapturedOutput output) {
        long slowestMs = 0;
        for (int i = 0; i < ROUNDS; i++) {
            upstream.clearPaths();
            long started = System.nanoTime();
            int status = client.get()
                    .uri("/api/publications")
                    .exchange()
                    .expectBody()
                    .returnResult()
                    .getStatus()
                    .value();
            long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
            slowestMs = Math.max(slowestMs, elapsedMs);

            assertThat(status)
                    .as("round %d: a never-answering limiter must not close the door (no 500/429/hang)", i)
                    .isEqualTo(200);
            assertThat(upstream.paths())
                    .as("round %d: the request must cross to the backend exactly ONCE — fail-open, no replay", i)
                    .hasSize(1);
        }
        assertThat(slowestMs)
                .as("the gateway's OWN deadline must fire; a genuine hang is the thing fail-open exists to prevent")
                .isLessThan(HANG_CEILING_MS);

        assertThat(output.getAll())
                .as("the fail-open decision must be logged (throttled), naming the backend")
                .contains("fail-open")
                .contains("redis");
    }
}
