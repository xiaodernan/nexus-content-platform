package dev.nexus.api.domain;

import dev.nexus.api.domain.DomainDtos.DomainResponse;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The door: read a project row THROUGH the domain service.
 *
 * <p>Three answers, three status codes, because the three are different facts:
 *
 * <ul>
 *   <li><b>200</b> — the domain service holds that project, and its body says so;</li>
 *   <li><b>404</b> — the domain service answered and does not hold it;</li>
 *   <li><b>503</b> — the domain service could not be reached, and the body NAMES it.</li>
 * </ul>
 *
 * <p>The 503 is the load-bearing one. A caller that asked "does this project exist?" and received a
 * 404 while the domain service was down would conclude the project is gone — and would say so, to
 * a user. The edge in this platform already refuses that confusion (see
 * {@code services/java-gateway}'s fallback, which answers 503 and names the upstream), and this door
 * keeps the same rule on the other side of the service boundary.
 *
 * <p>All three answers are ONE body type, so the state is never lost: a caller that reads only the
 * body still learns which of the three facts happened.
 */
@RestController
public class DomainController {

    private final DomainProjectReader reader;

    public DomainController(DomainProjectReader reader) {
        this.reader = reader;
    }

    /**
     * Read one project through the domain service.
     *
     * @param id the project id.
     * @return the project, a 404, or a 503 that names the domain service.
     */
    @GetMapping(path = "/domain/projects/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<DomainResponse> read(@PathVariable UUID id) {
        DomainResponse answer = reader.read(id);
        if (answer.isFound()) {
            return ResponseEntity.ok(answer);
        }
        if (answer.isUnavailable()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(answer);
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(answer);
    }
}
