package dev.nexus.gateway.ratelimit;

import io.micrometer.core.instrument.MeterRegistry;
import java.net.InetSocketAddress;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.cloud.gateway.filter.ratelimit.RateLimiter;
import org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import reactor.core.publisher.Mono;

/**
 * v657 — the two beans the route's `RequestRateLimiter` filter names, and the policy behind them.
 *
 * <p><b>Why {@code @Primary} on both.</b> Spring Cloud Gateway's own auto-configuration injects a
 * `RateLimiter` and a `KeyResolver` BY TYPE into `RequestRateLimiterGatewayFilterFactory`, so a
 * second bean of either type makes the gateway's context fail to start with "expected single
 * matching bean" — a failure that looks like a broken route table. Marking ours primary is what makes
 * the decorator the one the filter reaches for by default, while a route may still name a bean
 * explicitly (and this repository's route does, so the next reader can see WHICH limiter it means
 * without knowing what "primary" resolved to).
 */
@Configuration
@EnableConfigurationProperties(RateLimitProperties.class)
public class EdgeRateLimitConfiguration {

    /**
     * Which caller a bucket belongs to: the address the connection came FROM.
     *
     * <p><b>Deliberately not {@code X-Forwarded-For}.</b> A header anyone can type is a bucket anyone
     * can choose: a caller who sets `X-Forwarded-For: <random>` gets a fresh bucket per request and
     * the limiter counts nothing, which is a limiter that exists and does not exist. Trusting the
     * header is a DEPLOYMENT decision (it is only meaningful behind a proxy that overwrites it), so it
     * is not made here on the operator's behalf.
     *
     * <p><b>A request with no remote address.</b> That is not a caller the edge can name. All such
     * requests share one bucket named {@link #UNNAMED} rather than being let through uncounted: a
     * shared bucket is a real limit on an unknown population, while refusing would reject requests the
     * edge has no reason to reject and an empty key would disable the limiter for exactly the traffic
     * nobody can attribute.
     */
    public static final String UNNAMED = "unnamed-caller";

    @Bean
    @Primary
    public KeyResolver edgeKeyResolver() {
        return exchange -> {
            InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
            if (remote == null || remote.getAddress() == null) {
                return Mono.just(UNNAMED);
            }
            return Mono.just(remote.getAddress().getHostAddress());
        };
    }

    /**
     * The limiter the route names: the library's Redis counter, wrapped so a failure is a decision
     * instead of a 500.
     *
     * <p>The delegate is the auto-configured `RedisRateLimiter` — the same bean, the same Lua script,
     * the same three response headers. Nothing about the counting is reimplemented here.
     */
    @Bean
    @Primary
    public RateLimiter<RedisRateLimiter.Config> nexusRateLimiter(
            RedisRateLimiter redisRateLimiter, RateLimitProperties properties, MeterRegistry meters) {
        return new ResilientRateLimiter(redisRateLimiter, meters, properties.warnInterval(), System::nanoTime);
    }
}
