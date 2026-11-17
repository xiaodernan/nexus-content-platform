package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * The token bucket, graded without a server.
 *
 * <p>The numbers are chosen so the test cannot be flaky: refill rate 0 means tokens never come back, so
 * "burst 2" is exactly two allowed requests forever. A real rate would make the assertion a race against the
 * clock.
 */
class RateLimitFilterTest {

    private static final AtomicInteger CALLS = new AtomicInteger();

    private static GatewayFilterChain countingChain() {
        return (exchange) -> {
            CALLS.incrementAndGet();
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeFrom(String ip) {
        return MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/publications").remoteAddress(new InetSocketAddress(ip, 4567)));
    }

    private static ServerWebExchange exchangeWithForwardedFor(String forwardedFor, String peer) {
        return MockServerWebExchange.from(MockServerHttpRequest.get("/api/publications")
                .header("X-Forwarded-For", forwardedFor)
                .remoteAddress(new InetSocketAddress(peer, 4567)));
    }

    @Test
    void theBurstIsTheNumberOfRequestsThatGetThroughThenItIs429() {
        CALLS.set(0);
        // rate 0: no tokens are ever returned, which makes the count exact instead of timing-dependent.
        RateLimitFilter filter = new RateLimitFilter(true, new MemoryRateLimitBackend(0, 2, 100));
        GatewayFilterChain chain = countingChain();

        assertThat(filter.filter(exchangeFrom("10.1.0.1"), chain).block() == null).isTrue();
        assertThat(filter.filter(exchangeFrom("10.1.0.1"), chain).block() == null).isTrue();

        for (int i = 0; i < 3; i++) {
            ServerWebExchange refused = exchangeFrom("10.1.0.1");
            filter.filter(refused, chain).block();
            assertThat(refused.getResponse().getStatusCode().value()).isEqualTo(429);
            assertThat(refused.getResponse().getHeaders().getFirst("Retry-After")).isEqualTo("1");
        }

        // Refused requests never reached the chain: a 429 is work NOT done, not an error after doing it.
        assertThat(CALLS.get()).isEqualTo(2);
    }

    @Test
    void aDifferentClientHasItsOwnBucket() {
        CALLS.set(0);
        RateLimitFilter filter = new RateLimitFilter(true, new MemoryRateLimitBackend(0, 1, 100));
        GatewayFilterChain chain = countingChain();

        filter.filter(exchangeFrom("10.2.0.1"), chain).block();
        filter.filter(exchangeFrom("10.2.0.2"), chain).block();

        assertThat(CALLS.get()).isEqualTo(2);
    }

    @Test
    void theFirstForwardedForEntryIsTheClientKey() {
        CALLS.set(0);
        RateLimitFilter filter = new RateLimitFilter(true, new MemoryRateLimitBackend(0, 1, 100));
        GatewayFilterChain chain = countingChain();

        filter.filter(exchangeWithForwardedFor("203.0.113.9, 10.0.0.1", "10.3.0.1"), chain).block();
        // Same forwarded client, different peer: still one bucket.
        ServerWebExchange second = exchangeWithForwardedFor("203.0.113.9, 10.0.0.2", "10.3.0.2");
        filter.filter(second, chain).block();

        assertThat(second.getResponse().getStatusCode().value()).isEqualTo(429);
        assertThat(CALLS.get()).isEqualTo(1);
    }

    @Test
    void disabledMeansTheBucketDoesNotExist() {
        CALLS.set(0);
        RateLimitFilter filter = new RateLimitFilter(false, new MemoryRateLimitBackend(0, 1, 100));
        GatewayFilterChain chain = countingChain();

        filter.filter(exchangeFrom("10.4.0.1"), chain).block();
        filter.filter(exchangeFrom("10.4.0.1"), chain).block();
        filter.filter(exchangeFrom("10.4.0.1"), chain).block();

        assertThat(CALLS.get()).isEqualTo(3);
    }

    /**
     * The fail-open contract of SC-12. Redis down must not close the door: the limiter is a bound, not an
     * authentication check, and an outage of the component that slows traffic down must not become an outage
     * of all traffic. The request is allowed, and the response status is whatever the chain decides.
     */
    @Test
    void aFailingBackendAllowsTheRequestInsteadOfClosingTheDoor() {
        CALLS.set(0);
        RateLimitBackend failing = new RateLimitBackend() {
            @Override
            public Mono<Boolean> tryAcquire(String clientKey) {
                return Mono.error(new IllegalStateException("redis unreachable"));
            }

            @Override
            public String describe() {
                return "failing";
            }
        };
        RateLimitFilter filter = new RateLimitFilter(true, failing);
        ServerWebExchange exchange = exchangeFrom("10.5.0.1");

        filter.filter(exchange, countingChain()).block();

        assertThat(CALLS.get()).isEqualTo(1);
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    /**
     * §SC-37 · Redis ACL 出错报文（NOAUTH / NOPERM / WRONGPASS——Lua 的 redis.call 原样抛出的服务器错误）
     * 经 Lettuce 包装后落到本过滤器时，判定只能是"出错 → 放行（fail-open）"：限流器是一个边界，
     * 不是认证决定；把 ACL 拒绝读成"拒绝请求"会把 ACL 错误变成全站 49x。
     * 报文内容只进节流日志，绝不改变判定。
     */
    @Test
    void aclFlavoredRedisErrorsFailOpenNotClosed() throws Exception {
        String[] aclMessages = {
                "NOAUTH Authentication required.",
                "NOPERM this user has no permissions to run the 'EVALSHA' command",
                "WRONGPASS invalid username-password pair",
        };
        for (String message : aclMessages) {
            CALLS.set(0);
            RuntimeException aclError = new io.lettuce.core.RedisCommandExecutionException(message);
            RateLimitBackend failing = new RateLimitBackend() {
                @Override
                public Mono<Boolean> tryAcquire(String clientKey) {
                    return Mono.error(aclError);
                }

                @Override
                public String describe() {
                    return "redis";
                }
            };
            RateLimitFilter filter = new RateLimitFilter(true, failing);
            ServerWebExchange exchange = exchangeFrom("10.7.0.1");

            filter.filter(exchange, countingChain()).block();

            assertThat(CALLS.get()).as("request must pass through on %s", message).isEqualTo(1);
            assertThat(exchange.getResponse().getStatusCode()).as("no refusal on %s", message).isNull();
        }
    }

    /** A backend that answers with nothing is "no reason to refuse", not "refused". */
    @Test
    void aBackendThatCompletesEmptyAllowsTheRequest() {
        CALLS.set(0);
        RateLimitBackend silent = new RateLimitBackend() {
            @Override
            public Mono<Boolean> tryAcquire(String clientKey) {
                return Mono.empty();
            }

            @Override
            public String describe() {
                return "silent";
            }
        };
        RateLimitFilter filter = new RateLimitFilter(true, silent);

        filter.filter(exchangeFrom("10.6.0.1"), countingChain()).block();

        assertThat(CALLS.get()).isEqualTo(1);
    }
}
