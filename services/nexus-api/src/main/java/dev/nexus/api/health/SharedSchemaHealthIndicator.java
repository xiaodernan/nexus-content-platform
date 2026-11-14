package dev.nexus.api.health;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * §SC-69——Actuator health 不应停留在 "JVM 在跑"，必须真的能查 DB。
 *
 * <p>只跑 `SELECT 1`，不碰 schema，不leak 任何 column 名称——验证 Hikari pool 握手。
 * 失败只暴露短 Exception 类名（`SQLTransientConnectionException` 之类），
 * 不透 stacktrace；host/port/url 永远不进 HTTP 响应。
 */
@Component
public class SharedSchemaHealthIndicator implements HealthIndicator {

    private final JdbcTemplate jdbc;

    public SharedSchemaHealthIndicator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Health health() {
        try {
            Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
            if (one == null || one != 1) {
                return Health.down().withDetail("probe", "unexpected_result").build();
            }
            return Health.up().build();
        } catch (Exception e) {
            return Health.down().withDetail("probe", e.getClass().getSimpleName()).build();
        }
    }
}
