package dev.nexus.registry;

import com.netflix.discovery.shared.Applications;
import com.netflix.discovery.shared.Application;
import com.netflix.eureka.registry.PeerAwareInstanceRegistry;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * §SC-71 —— registry 节点的 /actuator/health 不应是最薄的空壳静态 UP。
 *
 * <p>这个服务没有 JPA、没有 Redis、没有磁盘写盘 —— 它的真值就在内存注册表里（ADR 0011 把数据库分给了
 * nexus-api）。所以诚实探针只有"读内存真值"这一条路，这里做到三点：
 *
 * <ul>
 *   <li>{@code mode: in-memory-standalone} —— 单节点、零持久化、peerless 是已知设计（见 RegistryApplication
 *       的 Javadoc），不是缺陷、也不冒充"集群高可用"；</li>
 *   <li>{@code applications} / {@code instances} —— 直接读内存注册表算出来的真实计数，空表就是 0，
 *       如实说，绝不因为"本进程活着"就谎称有服务在册；</li>
 *   <li>{@code renewsLastMinute} / {@code selfPreservation} —— 同一内存表的续约热度与自我保护开关，
 *       是 Eureka 自己的运行时事实，不是配置拷贝。</li>
 * </ul>
 *
 * <p>全部经 {@code PeerAwareInstanceRegistry} 接口读出（bean 的声明类型就是它），失败（极早期、未
 * openForTraffic）→ DOWN + 异常短类名，不 leak registry 内部结构、URL 或 lease 参数；
 * {@code show-details: never} 负责对外不出 detail。
 */
@Component
public class RegistryStandaloneHealthIndicator implements HealthIndicator {

    private final PeerAwareInstanceRegistry registry;

    public RegistryStandaloneHealthIndicator(PeerAwareInstanceRegistry registry) {
        this.registry = registry;
    }

    @Override
    public Health health() {
        try {
            Applications apps = registry.getApplications();
            int appCount = 0;
            int instanceCount = 0;
            if (apps != null && apps.getRegisteredApplications() != null) {
                appCount = apps.getRegisteredApplications().size();
                for (Application app : apps.getRegisteredApplications()) {
                    instanceCount += app.getInstancesAsIsFromEureka() == null
                            ? 0
                            : app.getInstancesAsIsFromEureka().size();
                }
            }
            return Health.up()
                    .withDetail("mode", "in-memory-standalone")
                    .withDetail("applications", appCount)
                    .withDetail("instances", instanceCount)
                    .withDetail("renewsLastMinute", registry.getNumOfRenewsInLastMin())
                    .withDetail("selfPreservation", registry.isSelfPreservationModeEnabled())
                    .build();
        } catch (Exception e) {
            return Health.down().withDetail("probe", e.getClass().getSimpleName()).build();
        }
    }
}
