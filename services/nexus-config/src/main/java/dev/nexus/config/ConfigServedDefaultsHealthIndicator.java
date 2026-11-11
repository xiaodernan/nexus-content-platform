package dev.nexus.config;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * §SC-71 —— 配置中心的价值全在于"它吐出去的就是客户端真会合并的那个默认值"。
 *
 * <p>这个服务以 {@code native} backend 从自身 classpath（{@code src/main/resources/nexus-config}）供配置。
 * 2026-11-11 出过一次真事故：{@code nexus-config/application.yml}（所有客户端合并的共享文件）被改成带
 * {@code circuitbreakers} 的暴露面，domain-service 因此继承了它不属于它的端点面，/actuator/circuitbreakers
 * 反而返回过 404（而不是预期的 401/403）—— 共享默认值是箭靶。这个探针把那道箭靶本身钉死再说：
 *
 * <ul>
 *   <li>{@code nexus-config/application.yml} 必须存在、必须可读 —— 不存在就是"配置中心一字节都没吐"；</li>
 *   <li>它必须仍然把暴露面收窄到 {@code health,info} —— 被意外放宽（或残缺文件被打进 jar）就报 DOWN，
 *   而不是等五个客户端启动时各自发现配置已变。</li>
 * </ul>
 *
 * <p>不读任何 {@code nexus-*.yml} 业务值，不把文件内容回给 caller —— {@code show-details: never} 对外只
 * 报 UP/DOWN；失败时 detail 只有异常短类名或形状关键字，不带文件路径、绝对位置或 stacktrace。
 */
@Component
public class ConfigServedDefaultsHealthIndicator implements HealthIndicator {

    private static final String SHARED_DEFAULT = "nexus-config/application.yml";

    @Override
    public Health health() {
        try {
            ClassPathResource resource = new ClassPathResource(SHARED_DEFAULT);
            if (!resource.exists()) {
                return Health.down().withDetail("probe", "shared_default_missing").build();
            }
            String text;
            try (InputStream in = resource.getInputStream()) {
                text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            // The narrowing rule that keeps one client's observability from bleeding into every client.
            // Presence-only check: the exact spacing/comments around the value are not the contract.
            boolean narrowed = text.replace(" ", "").replace("\t", "")
                    .contains("include:health,info");
            if (!narrowed) {
                return Health.down().withDetail("probe", "shared_default_too_wide").build();
            }
            return Health.up().withDetail("mode", "native-classpath").build();
        } catch (Exception e) {
            return Health.down().withDetail("probe", e.getClass().getSimpleName()).build();
        }
    }
}
