package dev.nexus.api.domain;

import dev.nexus.api.domain.DomainDtos.DomainResponse;
import dev.nexus.api.domain.DomainDtos.DomainProject;
import feign.FeignException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Reads a project row through the DOMAIN service, and says which of the three facts it got.
 *
 * <p>The whole job of this class is to keep three things apart that a naive call would collapse
 * into one:
 *
 * <ul>
 *   <li>the domain service <b>answered</b> and holds the project;</li>
 *   <li>the domain service <b>answered</b> and does not hold it;</li>
 *   <li>the domain service could not be <b>reached</b> at all.</li>
 * </ul>
 *
 * <p>Collapse the third into the second and a caller concludes that a project was deleted because
 * a service was down. Collapse it into the first and a caller shows an empty project. Both are
 * worse than a 503 that says the truth, and this repository has already decided the matter once —
 * the artifact page in this service answers 503 for "the service is not running" and 404 for
 * "nothing is published here" — so the same rule is carried across the service boundary here.
 *
 * <p>The circuit breaker that stands in front of the call is configured on the client; what this
 * class guarantees is that WHICHEVER way the call fails — an open breaker, a refused connection, a
 * timeout — the answer says {@code downstream-unavailable} rather than pretending the project is
 * absent.
 */
@Service
public class DomainProjectReader {

    private static final Logger log = LoggerFactory.getLogger(DomainProjectReader.class);

    private final DomainServiceClient client;

    public DomainProjectReader(DomainServiceClient client) {
        this.client = client;
    }

    /**
     * Read one project through the domain service.
     *
     * <p>Never throws: every failure becomes one of the three states, because a reader whose
     * failure mode is an exception forces every caller to write the same three-way branch.
     */
    public DomainResponse read(UUID id) {
        try {
            DomainProject project = client.getProject(id);
            if (project == null) {
                // A 200 with no body is not a project. It is a malformed answer, and it is treated
                // as the failure it is rather than as "a project with no fields".
                log.warn("the domain service answered a project read with an empty body");
                return DomainResponse.unavailable(
                        "the domain service answered with an empty body; no project was invented from it");
            }
            return DomainResponse.found(project);
        } catch (FeignException.NotFound notFound) {
            return DomainResponse.notFound();
        } catch (FeignException e) {
            log.warn("the domain service could not be reached: {}", e.getMessage());
            return DomainResponse.unavailable(
                    "the domain service could not be reached: " + e.getMessage());
        } catch (RuntimeException e) {
            // The breaker refusing, a load balancer with no instance, a DNS failure — none of these
            // is a fact about the project, so none of them may be reported as one.
            log.warn("the domain service could not be reached: {}", e.getMessage());
            return DomainResponse.unavailable(
                    "the domain service could not be reached: " + e.getMessage());
        }
    }
}
