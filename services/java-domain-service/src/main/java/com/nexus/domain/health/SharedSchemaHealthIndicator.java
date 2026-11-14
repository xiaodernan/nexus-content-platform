package com.nexus.domain.health;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * §SC-69：shared schema 必须是 UP —— 不是 JVM 内存池的 "Tomcat 能起"，而是 Hikari pool 能 SQL-握手到 Postgres。
 *
 * <p>这个探针 <strong>只</strong> 做一件事：`SELECT 1`。不读业务表、不曝密码/口令、不 leak schema 名、
 * 不漏 host 名。 catch 后只暴露 exception class（不带 message）——外部客户端从 body 看不到内部细节。
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
            // SELECT 1 只连池、不查询 schema——最轻、最能不 leak 任何实际数据。
            Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
            if (one == null || one != 1) {
                return Health.down().withDetail("probe", "unexpected_result").build();
            }
            return Health.up().build();
        } catch (Exception e) {
            // 只暴露异常短类名（RuReclaimException 之类），不透 host/dbname/密码
            return Health.down().withDetail("probe", e.getClass().getSimpleName()).build();
        }
    }
}
