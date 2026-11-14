package com.nexus.domain.feign;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;

/**
 * §SC-59：把 Java→Python 这一跳放到运维眼前。
 *
 * <p>Domain-service（Spring Cloud）经 Feign 声明式客户端把一跳真实发到 {@code apps/ai-service}
 * （Python）并把**它**的报文原样端出去——不二次加工、不代判绿红：
 * <ul>
 *   <li>上游活着：{@code status:"healthy"} + 报文原样副本（service/capability/providers/queue）
 *       + {@code responseTimeMs}——它报什么我们就端什么，多的字段不抹掉、缺的字段不造出来；</li>
 *   <li>上游死了：{@code status:"degraded"} + {@code error}（异常类名）+ {@code message}——
 *       200 不是健康的承诺，body 才是现场（同社区 /policy、/realtime/stats 的自报家门口径）；</li>
 *   <li>connect/read timeout 由 yml 钉死（1s 连接、3s 读，可 env 覆盖）——
 *       999ms 的探针挂住 30s 就不叫探针了。</li>
 * </ul>
 *
 * <p>不带 {@code X-Nexus-Subject}：只放健康形状、只读、不写库、不带载荷——与 {@code /policy}、
 * {@code /realtime/stats} 同一口径未鉴权。多实例部署下回答的是"回答这次请求的那台"，页面别当成全平台了。
 */
@RestController
public class AiHealthController {

    private final AiServiceClient ai;
    /** null when the breaker is switched off by env — omit the field then, don't print a fake CLOSED. */
    private final CircuitBreakerRegistry breakerRegistry;

    public AiHealthController(AiServiceClient ai,
                              @Autowired(required = false) CircuitBreakerRegistry breakerRegistry) {
        this.ai = ai;
        this.breakerRegistry = breakerRegistry;
    }

    @GetMapping("/api/v1/system/ai-health")
    public Map<String, Object> aiHealth() {
        long start = System.nanoTime();
        try {
            Map<String, Object> report = ai.healthz();
            long ms = Duration.ofNanos(System.nanoTime() - start).toMillis();
            // 原样副本：报文形状由 Python 定——这台 Java 只负责"问到了"，不改它说什么
            Map<String, Object> out = new LinkedHashMap<>(report == null ? Map.of() : report);
            out.put("status", "healthy");
            out.put("responseTimeMs", ms);
            out.put("breakerState", currentBreakerState());
            return out;
        } catch (RuntimeException e) {
            long ms = Duration.ofNanos(System.nanoTime() - start).toMillis();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", "degraded");
            out.put("error", e.getClass().getSimpleName());
            out.put("message", String.valueOf(e.getMessage()));
            out.put("responseTimeMs", ms);
            out.put("breakerState", currentBreakerState());
            return out;
        }
    }

    /** null → 部署把断路器关了（`NEXUS_FEIGN_BREAKER=false`），不编自己像 CLOSED。 */
    private String currentBreakerState() {
        if (breakerRegistry == null) {
            return null;
        }
        // Feign 的 CircuitBreaker 名称解析器在名字里带接口名（如 "AiServiceClienthealthz"），
        // 不是 "ai-service"；两个都找，有 buffered 数据的优先。
        return breakerRegistry.getAllCircuitBreakers().stream()
                .filter(c -> "ai-service".equals(c.getName()) || c.getName().contains("AiServiceClient"))
                .max(java.util.Comparator.comparingLong(c -> c.getMetrics().getNumberOfBufferedCalls()))
                .map(c -> c.getState().name())
                .orElse("unknown");
    }
}
