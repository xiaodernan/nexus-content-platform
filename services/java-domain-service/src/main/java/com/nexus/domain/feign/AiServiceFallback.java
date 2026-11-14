package com.nexus.domain.feign;

import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * §SC-60 — Fallback for dead ai-service (ported circuit open).
 *
 * <p>Spring Cloud CircuitBreaker routes failed and short-circuited calls here.
 * The fallback's only honest move is to escalate, never to produce a fake body that looks like a
 * healthy report — that would make every admin panel reader conclude
 * "Python is unavailable" is the same thing as "Python healthy", which is exactly the fake the probes
 * exist to kill. So it throws {@link AiServiceUnavailableException}, whose class name says what
 * actually happened, instead of a synthesized {@code Map} that can be silently scored as OK.
 */
@Component
public class AiServiceFallback implements AiServiceClient {

    @Override
    public Map<String, Object> healthz() {
        throw new AiServiceUnavailableException(
                "ai-service unreachable, circuit breaker answered — this is not a healthy report; wait 10s and re-probe.");
    }
}
