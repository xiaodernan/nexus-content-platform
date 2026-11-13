package dev.nexus.gateway.fallback;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

/**
 * What the edge says when a service behind it could not be reached.
 *
 * <p>This handler is the answer to the single most dangerous thing a gateway can do: <em>answer
 * anyway</em>. A caller asks for a project, the service that owns projects is down, and an edge
 * that is feeling helpful returns {@code 200 OK} with an empty body. The caller cannot tell that
 * apart from "the project does not exist" — and it will go looking for the problem in the wrong
 * place, which is exactly the failure the artifact page in {@code services/nexus-api} already
 * refuses (it answers 503 for "the service is not running" and 404 for "nothing is published
 * here", because those are different facts).
 *
 * <p>So this handler answers:
 * <ul>
 *   <li><b>503</b> — the upstream was named and could not be reached;</li>
 *   <li>with a body that says <em>which</em> upstream, so the operator is not guessing;</li>
 *   <li>and with {@code ok: false}, so a client that checks the field agrees with the status code;</li>
 *   <li>and with no payload that could be mistaken for the answer the caller asked for.</li>
 * </ul>
 *
 * <p>The {@code upstream} name comes from the FALLBACK URI, not from a guess: the route's circuit
 * breaker names the upstream it was protecting, and that name is what is forwarded here. A body
 * that named the wrong service would be a worse lie than no body at all.
 *
 * <h2>And it says WHICH failure, not only which service</h2>
 *
 * <p>Naming the upstream answers "where do I look?"; it does not answer "what happened?".
 * A refused connection, a call that timed out, a breaker that was open and an upstream that is
 * not registered anywhere are four different problems with four different fixes, and an edge that
 * answers all four with the same sentence forces the operator to go and find out which it was —
 * usually by reading logs that say "No fallback available.".
 *
 * <p>So the failure is taken from the exchange, where Spring Cloud's own circuit breaker filter
 * leaves it ({@code ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR} — measured in
 * the jar, {@code SpringCloudCircuitBreakerFilterFactory}), and named by {@link UpstreamFailure}.
 */
@RestController
public class UpstreamFallbackHandler {

    private static final Logger log = LoggerFactory.getLogger(UpstreamFallbackHandler.class);

    /**
     * The circuit breaker's fallback target.
     *
     * <p>The path variable is the upstream's name, because the route's {@code fallbackUri} carries
     * it — e.g. {@code forward:/__fallback/nexus-api} for the route that fronts {@code nexus-api}.
     */
    @RequestMapping(path = "/__fallback/{upstream}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> upstreamUnavailable(
            @PathVariable("upstream") String upstream, ServerWebExchange exchange) {
        Throwable failure = exchange.getAttribute(ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR);
        UpstreamFailure classified = UpstreamFailure.classify(failure);

        // The whole chain goes into the log: the wrapper's own message names neither the upstream
        // nor the failure, and the chain is where the truth is.
        log.warn("the upstream {} could not be reached ({}): {}", upstream, classified.kind(),
                UpstreamFailure.chainOf(failure));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("reason", "upstream-unavailable");
        body.put("upstream", upstream);
        body.put("failure", classified.kind());
        body.put("detail", "the gateway could not reach " + upstream + ": " + classified.detail()
                + "; no answer was invented on its behalf");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
