package dev.nexus.api.domain;

import feign.FeignException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import java.io.InterruptedIOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

/**
 * Which kind of failure a call to the domain service ran into, and a sentence that says so.
 *
 * <p>This type exists because of a measured lie. The reader used to answer
 * {@code "the domain service answered with an error -1"} when the domain service was DOWN —
 * and "-1" is not an HTTP status at all. It is the number Feign uses for "the call never
 * completed". So the answer said the service ANSWERED, when the whole fact of the failure is
 * that it did not.
 *
 * <p>Where that number comes from, read out of the library rather than guessed (Feign 13.6.1,
 * inspected with {@code javap} on {@code feign.FeignException}):
 *
 * <ul>
 *   <li>{@code FeignException.errorExecuting(Request, IOException)} builds a
 *       {@code RetryableException} with status {@code -1} and the message
 *       {@code "%s executing %s %s"} — the IOException's own message first. A refused
 *       connection, an unresolvable host and a read timeout all arrive that way: <b>no
 *       answer</b>;</li>
 *   <li>{@code ErrorDecoder$Default} (via {@code RetryAfterDecoder}) builds a
 *       {@code RetryableException} with the <b>real</b> HTTP status when the response carries a
 *       {@code Retry-After} header — that one <b>is</b> an answer;</li>
 *   <li>every other HTTP error arrives as a plain {@code FeignException} carrying its real
 *       status.</li>
 * </ul>
 *
 * <p>So the rule is not a convention anybody agreed on — it is what the library does:
 * <b>a status below 400 means no answer was received; a status from 400 to 599 means the
 * service answered and its answer was an error.</b> The two are different facts and the old
 * wording merged them.
 *
 * <p>The kinds below are STABLE STRINGS, because a caller may branch on them. They are not
 * exception class names: a class name is a fact about our own dependency tree, and a caller
 * that branches on it breaks the day the library renames something. A kind is a fact about the
 * failure.
 *
 * <p>What is deliberately NOT here: the name of a host, a port, or a URL. The reason sentences
 * name the SERVICE and the KIND of failure, and nothing about where it lives — an internal
 * address in a 503 body is information a caller outside this platform has no use for.
 */
public record DomainFailure(String kind, String reason) {

    /** The downstream answered, and the answer was an HTTP error (4xx/5xx). */
    public static final String ERROR_STATUS = "error-status";

    /** Nothing was listening: the connection was refused. */
    public static final String CONNECTION_REFUSED = "connection-refused";

    /** The host name could not be resolved. */
    public static final String HOST_UNKNOWN = "host-unknown";

    /** The call did not finish in time. */
    public static final String TIMEOUT = "timeout";

    /** The circuit breaker in front of the call refused it — the call was never made. */
    public static final String CIRCUIT_BREAKER_OPEN = "circuit-breaker-open";

    /** The router had no instance to choose: the service is registered nowhere it can reach. */
    public static final String NO_INSTANCE = "no-instance";

    /** The downstream answered, and the answer was not a project. */
    public static final String MALFORMED_ANSWER = "malformed-answer";

    /** A failure this classifier does not know how to name. It says so rather than guessing. */
    public static final String UNKNOWN = "unknown";

    /**
     * How far down a cause chain this classifier is willing to walk.
     *
     * <p>Java forbids an exception from causing <b>itself</b>, but not two exceptions from causing
     * each other — and a chain that loops would hang the reader forever, on a thread that is
     * supposed to answer a caller. A real chain is a handful of links deep, so the cap costs
     * nothing and removes the hang.
     */
    private static final int MAX_CAUSE_DEPTH = 32;

    /**
     * The downstream answered with something that is not a project.
     *
     * <p>A 200 with an empty body is not "a project with no fields" — it is a malformed answer,
     * and it is reported as the failure it is.
     */
    public static DomainFailure malformedAnswer(String reason) {
        return new DomainFailure(MALFORMED_ANSWER, reason);
    }

    /**
     * Classify a failure that is NOT a 404.
     *
     * <p>A 404 is not a failure of the service — it is a fact about the project — so the reader
     * decides that case itself, before calling this.
     *
     * @param failure the exception the call produced, wrapper and all.
     * @return the kind and a sentence that says it.
     */
    public static DomainFailure classify(Throwable failure) {
        FeignException answered = findAnswered(failure);
        if (answered != null) {
            int status = answered.status();
            if (status >= 400 && status <= 599) {
                // The service WAS there, and it answered. Its answer was an error — which is its
                // failure, and emphatically not the project's absence.
                return new DomainFailure(ERROR_STATUS,
                        "the domain service answered with an error " + status + ": " + answered.getMessage());
            }
            // Below 400 there is no HTTP status: Feign's "-1" for a call that never completed.
            // Fall through to the transport rules, which can say WHICH transport failure it was.
        }
        return classifyTransport(failure);
    }

    /**
     * Name a transport-level failure by looking at every exception in the chain.
     *
     * <p>The chain is walked from the OUTSIDE IN, and the first specific match wins. The outside
     * is where the wrappers live ({@code NoFallbackAvailableException}, {@code RetryableException}),
     * and none of them matches a specific rule — so the walk reaches the exception that actually
     * says what went wrong.
     */
    private static DomainFailure classifyTransport(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++, current = causeOf(current)) {
            if (current instanceof CallNotPermittedException) {
                return new DomainFailure(CIRCUIT_BREAKER_OPEN,
                        "the circuit breaker in front of the domain service refused the call");
            }
            if (isNoInstance(current)) {
                return new DomainFailure(NO_INSTANCE,
                        "the domain service could not be reached: no instance was available to route to");
            }
            if (current instanceof ConnectException) {
                return new DomainFailure(CONNECTION_REFUSED,
                        "the domain service could not be reached: the connection was refused");
            }
            if (current instanceof UnknownHostException) {
                return new DomainFailure(HOST_UNKNOWN,
                        "the domain service could not be reached: the host name could not be resolved");
            }
            if (current instanceof SocketTimeoutException || current instanceof InterruptedIOException) {
                return new DomainFailure(TIMEOUT,
                        "the domain service could not be reached: the call did not finish in time");
            }
        }
        Throwable deepest = deepestCause(failure);
        return new DomainFailure(UNKNOWN,
                "the domain service could not be reached: " + describe(deepest));
    }

    /**
     * Whether this is Spring Cloud's "there is nobody to route to".
     *
     * <p>There is no exception TYPE for it: {@code BlockingLoadBalancerClient} raises a plain
     * {@link IllegalStateException} whose message begins "No instances available for". Matching
     * the message is fragile and is done anyway, because the alternative — reporting "no instance
     * available" for every {@code IllegalStateException} — would be a worse lie. If Spring Cloud
     * ever gives this a type, this is the line to change.
     */
    private static boolean isNoInstance(Throwable current) {
        return current instanceof IllegalStateException
                && current.getMessage() != null
                && current.getMessage().startsWith("No instances available for");
    }

    /**
     * The downstream's own HTTP answer, wherever it sits in the chain.
     *
     * @return the answer, or {@code null} when no HTTP answer was received at all.
     */
    public static FeignException findAnswered(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++, current = causeOf(current)) {
            if (current instanceof FeignException answered) {
                return answered;
            }
        }
        return null;
    }

    /** The innermost exception in the chain. */
    public static Throwable deepestCause(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
            Throwable next = causeOf(current);
            if (next == null) {
                return current;
            }
            current = next;
        }
        return current;
    }

    /** The cause of a failure, or {@code null}. A failure that causes itself stops the walk. */
    private static Throwable causeOf(Throwable failure) {
        Throwable cause = failure.getCause();
        return cause == failure ? null : cause;
    }

    /** One line per exception, so an operator can read the whole story in one log line. */
    public static String chainOf(Throwable failure) {
        StringBuilder chain = new StringBuilder();
        Throwable current = failure;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++, current = causeOf(current)) {
            if (chain.length() > 0) {
                chain.append(" <- ");
            }
            chain.append(describe(current));
        }
        return chain.toString();
    }

    /** One exception, named: {@code "ClassName: message"}. */
    private static String describe(Throwable failure) {
        if (failure == null) {
            return "no exception";
        }
        String message = failure.getMessage();
        return message == null || message.isBlank()
                ? failure.getClass().getSimpleName()
                : failure.getClass().getSimpleName() + ": " + message;
    }
}
