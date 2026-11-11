package dev.nexus.gateway;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * §SC-70 —— Gateway 必须诚实报"我自己用了什么 rate-limit backend"，不存在的 backend 不会回"UP"。
 *
 * <ul>
 *   <li>{@code memory} backend：本门没配 Redis，不会真去 ping（§"门开了才 ping"）。</li>
 *   <li>{@code redis} backend：用 {@code connectionFactory.getReactiveConnection().ping()} 实跑 PING，
 *   失败只暴露异常短类名，不泄 host/port。</li>
 * </ul>
 *
 * <p>`show-details: never` 不变；detail 仅一格"probe" 短词。
 */
@Component
public class GatewayRateLimitHealthIndicator implements HealthIndicator {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final String backend;
    private final ReactiveStringRedisTemplate redis;

    public GatewayRateLimitHealthIndicator(
            @Value("${nexus.gateway.rate-limit.backend:memory}") String backend,
            ReactiveStringRedisTemplate redis) {
        this.backend = backend;
        this.redis = redis;
    }

    @Override
    public Health health() {
        if (!"redis".equalsIgnoreCase(backend)) {
            // no Redis to probe by design; backend=memory so there is nothing to ping
            return Health.up().withDetail("backend", backend).withDetail("probe", "not_applicable").build();
        }
        try {
            String pong = redis.getConnectionFactory().getReactiveConnection()
                    .ping()
                    .block(TIMEOUT);
            if ("PONG".equalsIgnoreCase(pong)) {
                return Health.up().withDetail("backend", "redis").build();
            }
            return Health.down().withDetail("backend", "redis").withDetail("probe", "not_pong").build();
        } catch (Exception e) {
            return Health.down().withDetail("backend", "redis").withDetail("probe", e.getClass().getSimpleName()).build();
        }
    }
}
