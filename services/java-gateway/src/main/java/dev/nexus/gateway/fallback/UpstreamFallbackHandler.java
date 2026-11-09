package dev.nexus.gateway.fallback;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
 */
@RestController
public class UpstreamFallbackHandler {

    /**
     * The circuit breaker's fallback target.
     *
     * <p>The path variable is the upstream's name, because the route's {@code fallbackUri} carries
     * it — e.g. {@code forward:/__fallback/nexus-api} for the route that fronts {@code nexus-api}.
     */
    @RequestMapping(path = "/__fallback/{upstream}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> upstreamUnavailable(@PathVariable("upstream") String upstream) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("reason", "upstream-unavailable");
        body.put("upstream", upstream);
        body.put("detail",
                "the gateway could not reach the upstream service; no answer was invented on its behalf");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
