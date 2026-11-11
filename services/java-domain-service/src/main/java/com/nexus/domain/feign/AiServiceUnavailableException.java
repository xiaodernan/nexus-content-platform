package com.nexus.domain.feign;

/**
 * §SC-60 — the circuit breaker said "not now".
 *
 * <p>Raised when the fallback runs instead of a real call to ai-service: the caller never sees a
 * fabricated "healthy" body. The class name appears in the HTTP response's {@code error} field and
 * therefore on every admin panel that reads {@code GET /api/v1/system/ai-health}, so "which
 * circuit decided" is greppable in one word — that is the entire point of a dedicated exception.
 */
public class AiServiceUnavailableException extends RuntimeException {

    public AiServiceUnavailableException(String message) {
        super(message);
    }
}
