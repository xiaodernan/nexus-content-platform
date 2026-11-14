package dev.nexus.gateway;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

/**
 * What the gateway says when it could not complete the call.
 *
 * <p>The status is 503 and it is never anything else. A circuit breaker's easiest failure mode is a fallback
 * that answers {@code 200 []}: the caller cannot tell "the system of record has no publications" from "the
 * system of record is down", and a Studio showing an empty library after an outage is a lie the platform
 * told about the user's own work (§159 forbids exactly this shape).
 *
 * <p>The cause is read from the attribute the breaker filter actually set, not guessed from the service
 * name. When the attribute is absent the answer says so — an invented exception class would be evidence
 * nobody produced.
 */
@RestController
public class FallbackController {

    @RequestMapping("/fallback/{service}")
    public ResponseEntity<Map<String, Object>> unavailable(
            @PathVariable("service") String service, ServerWebExchange exchange) {
        Object cause = exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "service_unavailable");
        body.put("service", service);
        body.put("cause", cause instanceof Throwable t ? t.getClass().getName() : "not-reported");
        body.put("note", "the gateway did not reach a result for this call; an empty list would mean something else");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}