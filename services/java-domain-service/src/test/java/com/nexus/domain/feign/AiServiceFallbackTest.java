package com.nexus.domain.feign;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * §SC-60 — the fallback is an escalation, never a masking surface.
 *
 * <p>Fallback contract: it throws. It never returns a synthesized body that looks like a healthy
 * /healthz report. If the circuit is open, the caller sees {@code AiServiceUnavailableException} —
 * the name points at the class that decided not to even try, not at "provider broken".
 */
class AiServiceFallbackTest {

    @Test
    void fallbackRaisesUnavailableNotAHealthyPayload() {
        AiServiceFallback fallback = new AiServiceFallback();

        assertThatThrownBy(fallback::healthz)
                .isInstanceOf(AiServiceUnavailableException.class)
                .hasMessageContaining("ai-service unreachable")
                .hasMessageContaining("circuit breaker")
                .hasMessageContaining("not a healthy report");
    }
}
