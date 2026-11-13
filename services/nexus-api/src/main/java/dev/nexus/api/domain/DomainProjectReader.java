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
 * <h2>Why this class digs through the cause chain</h2>
 *
 * <p>Because the failure arrives WRAPPED, and the wrapper is the whole story.
 *
 * <p>Measured 2026-11-09, on the topology proof: with a circuit breaker in front of the call, a 404
 * from the domain service arrived at this class as
 *
 * <pre>NoFallbackAvailableException: No fallback available.
 *   (cause: NotFound: [404] during [GET] to [http://nexus-domain-service/api/v1/projects/…])</pre>
 *
 * <p>Spring Cloud's OpenFeign integration routes EVERY exception through the breaker's fallback
 * function, and with no fallback bean configured that function throws
 * {@code NoFallbackAvailableException} **wrapping the original**. The original exception is in the
 * cause — and the original exception is the fact.
 *
 * <p>So a reader that only recognised a bare {@code FeignException} answered <b>503 "the domain
 * service could not be reached"</b> to a caller who had asked about a project that simply does not
 * exist. That is the exact lie this slice exists to prevent, produced by a wrapper rather than by a
 * mistake in the logic.
 *
 * <p>Hence: find the {@link FeignException} wherever it is in the chain, and decide by its
 * <b>status</b> — 404 is a fact about the project, anything else is a fact about the service.
 *
 * <p>And a fact about the service has to be NAMED. The wrapper's own message ("No fallback
 * available.") names neither the service nor the failure, so an operator reading it has to go
 * looking; {@link DomainFailure} turns the chain into a word a caller can branch on
 * ({@code connection-refused}, {@code circuit-breaker-open}, {@code timeout}, …) and a sentence
 * that says which it was.
 */
@Service
public class DomainProjectReader {

    private static final Logger log = LoggerFactory.getLogger(DomainProjectReader.class);

    private final DomainServiceRetry retry;

    /**
     * Pre-v669 construction, kept verbatim: a pass-through retry that calls the client exactly once.
     * Every existing test uses this, so adding the retry pillar changes NO behaviour for a caller
     * that did not opt into one — and the reader stays trivially unit-testable without a Spring
     * context or a RetryRegistry.
     */
    public DomainProjectReader(DomainServiceClient client) {
        this(new DomainServiceRetry(client));
    }

    /**
     * v669 — Spring injects the retry wired to the YAML-declared {@code Retry} instance. The reader
     * knows nothing about attempts or backoff; it just asks the retry to run the call and keeps its
     * one job: saying which of the three facts came back.
     *
     * <p>{@code @Autowired} is REQUIRED and not decorative: a class with two single-argument
     * constructors fails Spring context startup with "no default constructor found" — the other
     * constructor starts out looking unannotatable because it is the convenience path used by unit
     * tests without a context. Without the marker here, Spring cannot tell which of the two it
     * wants, refuses to guess between two single-argument constructors, and the wiring test goes
     * red for a reason nobody would look up without booting Spring once to see it fail.
     */
    @org.springframework.beans.factory.annotation.Autowired
    public DomainProjectReader(DomainServiceRetry retry) {
        this.retry = retry;
    }

    /**
     * Read one project through the domain service.
     *
     * <p>Never throws: every failure becomes one of the three states, because a reader whose
     * failure mode is an exception forces every caller to write the same three-way branch.
     */
    public DomainResponse read(UUID id) {
        try {
            // v669: the SAME typed call, now optionally wrapped in a bounded retry. A pass-through
            // retry (the default constructor) makes exactly one call — byte-for-byte pre-v669.
            DomainProject project = retry.getProject(id);
            if (project == null) {
                // A 200 with no body is not a project. It is a malformed answer, and it is treated
                // as the failure it is rather than as "a project with no fields".
                log.warn("the domain service answered a project read with an empty body");
                return DomainResponse.unavailable(DomainFailure.malformedAnswer(
                        "the domain service answered with an empty body; no project was invented from it"));
            }
            return DomainResponse.found(project);
        } catch (RuntimeException failure) {
            return classify(failure);
        }
    }

    /**
     * Turn a failure into one of the three facts.
     *
     * <p>The order matters: the downstream's own answer comes FIRST, because it is the more specific
     * fact. A 404 that the breaker wrapped is still a 404 — it says the service was there, healthy,
     * and holding no such row.
     *
     * <p>Everything else is a failure of the SERVICE, and it is named: {@link DomainFailure} works
     * out which kind it was (the connection was refused, the breaker was open, the call timed out,
     * the service answered with an error) so that neither the answer nor the log says only
     * "No fallback available." — which names neither the service nor the failure.
     */
    private DomainResponse classify(RuntimeException failure) {
        FeignException answered = DomainFailure.findAnswered(failure);
        if (answered != null && answered.status() == 404) {
            return DomainResponse.notFound();
        }

        DomainFailure classified = DomainFailure.classify(failure);
        // The whole chain goes into the log, because "which failure" is the question an operator
        // asks first, and the WRAPPER's message ("No fallback available.") does not answer it.
        // The chain is one line: A: msg <- B: msg <- C: msg.
        log.warn("the domain service call failed ({}): {}", classified.kind(),
                DomainFailure.chainOf(failure));
        return DomainResponse.unavailable(classified);
    }
}
