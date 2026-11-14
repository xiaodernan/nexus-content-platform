package com.nexus.domain.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

import java.util.Map;

/**
 * The JVM's declarative client for {@code apps/ai-service} (the Python model router).
 *
 * <p>One real leg today: {@code /healthz} — the liveness report the service actually answers
 * ({@code service / version / capability / providers / queue}). The body is read as a map on purpose:
 * this service does not interpret provider states, and a typed mirror of the report would go stale the
 * day the report grows a field.
 *
 * <p>What is deliberately NOT here: a generation leg. The web layer calls {@code /v1/ai/*} and persists
 * the plan itself (ADR 0011: the AI service returns plans and patches; persistence stays in the web
 * layer). The first draft of this client posted to {@code /generate} and claimed to return a {@code User}
 * — an endpoint that exists nowhere and a type that cannot answer, i.e. a fake API (§159); it is not
 * carried forward.
 *
 * <p>Resolved by explicit URL ({@code NEXUS_AI_SERVICE_URL}, default the documented ai port 8000), so
 * like every other half of this service it is inert until a caller injects it.
 *
 * <p>The client carries a fallback ({@code AiServiceFallback} since §SC-60): repeated probes against
 * a dead Python stop being free connection-refused episodes and become an honest degraded report naming
 * the circuit. The fallback throws — it never fabricates a healthy payload.
 */
@FeignClient(name = "ai-service", url = "${NEXUS_AI_SERVICE_URL:http://127.0.0.1:8000}", fallback = AiServiceFallback.class)
public interface AiServiceClient {

    @GetMapping("/healthz")
    Map<String, Object> healthz();
}
