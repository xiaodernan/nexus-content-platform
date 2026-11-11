package com.nexus.domain.info;

import java.util.Map;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;

/**
 * SC-66 — 显式提供 Java 侧上下文 info，让运维 /actuator/info 有真内容。
 *
 * <p>写 NEXUS 自己的 `name`/`version`/`java`，不读 env（避免泄漏密码）：
 * <ul>
 *   <li>name：domain-service（和 application.yml 写到一起）</li>
 *   <li>runtime：Java 版本 / OS</li>
 *   <li>app：group/version 和描述固定串</li>
 * </ul>
 * 都是固定串，没有从 System.env 借数据，所以不存在 secret 泄漏风险。
 */
@Component
public class DomainServiceInfoContributor implements InfoContributor, Ordered {

    /** 在自动注册的 info 占位之上设置高优，保证人看见这条是第一眼。 */
    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("app", Map.of(
                "name", "java-domain-service",
                "description", "NEXUS Java-side service (java-domain-service)",
                "group", "com.nexus",
                "artifact", "domain-service",
                "version", "1.0.0-SNAPSHOT"));
        builder.withDetail("runtime", Map.of(
                "java", System.getProperty("java.version"),
                "vendor", System.getProperty("java.vendor")));
        builder.withDetail("os", Map.of(
                "name", System.getProperty("os.name"),
                "arch", System.getProperty("os.arch")));
    }
}
