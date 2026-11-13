package dev.nexus.gateway.fallback;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.concurrent.TimeoutException;

/**
 * Which kind of failure stopped the edge from reaching an upstream, and a sentence that says so.
 *
 * <p>This is the edge's half of a rule the platform already follows on the other side of a service
 * boundary: a failure that is not named is a failure an operator has to guess about. The edge
 * already NAMES the upstream (the route's fallback URI carries it); what it could not do until now
 * was name the FAILURE — so every 503 read the same, whether the upstream refused the connection,
 * timed out, was not registered anywhere, or was simply not there any more.
 *
 * <p>The four kinds are the four things that actually happen to an edge:
 *
 * <ul>
 *   <li>{@code circuit-breaker-open} — the breaker refused the call. The upstream was never
 *       contacted, so this is NOT the same fact as "the upstream refused the connection";</li>
 *   <li>{@code connection-refused} — the upstream was contacted and nothing was listening;</li>
 *   <li>{@code timeout} — the upstream was contacted and did not answer in time;</li>
 *   <li>{@code no-instance} — there was no upstream to contact at all.</li>
 * </ul>
 *
 * <p>And {@code unknown} for anything else: an edge that cannot name a failure says so, rather
 * than picking the nearest word and sending it to a caller who will believe it.
 *
 * <p>The kinds are STABLE STRINGS, because a caller may branch on them. They are not exception
 * class names: a class name is a fact about this repository's dependency tree, and a caller that
 * branches on it breaks the day a library renames something.
 */
public record UpstreamFailure(String kind, String detail) {

    /** The breaker refused the call: the upstream was never contacted. */
    public static final String CIRCUIT_BREAKER_OPEN = "circuit-breaker-open";

    /** The upstream was contacted and nothing was listening. */
    public static final String CONNECTION_REFUSED = "connection-refused";

    /** The upstream was contacted and did not answer in time. */
    public static final String TIMEOUT = "timeout";

    /** There was no upstream to contact. */
    public static final String NO_INSTANCE = "no-instance";

    /** A failure this classifier does not know how to name. */
    public static final String UNKNOWN = "unknown";

    /**
     * How far down a cause chain this classifier is willing to walk.
     *
     * <p>Java forbids an exception from causing itself, but not two from causing each other — and a
     * chain that loops would hang the edge, which is the one thing an edge must never do.
     */
    private static final int MAX_CAUSE_DEPTH = 32;

    /**
     * Name a failure, or say that it could not be named.
     *
     * @param failure the throwable the edge caught, or {@code null} when there was none.
     * @return the kind and a sentence that says it — never {@code null}.
     */
    public static UpstreamFailure classify(Throwable failure) {
        if (failure == null) {
            return new UpstreamFailure(UNKNOWN,
                    "the edge reached its fallback without an exception to explain why");
        }
        for (Throwable current = failure; current != null; current = causeOf(current)) {
            if (current instanceof CallNotPermittedException) {
                return new UpstreamFailure(CIRCUIT_BREAKER_OPEN,
                        "the circuit breaker in front of the upstream refused the call");
            }
            if (isNoInstance(current)) {
                return new UpstreamFailure(NO_INSTANCE, "there was no upstream instance to route to");
            }
            if (current instanceof ConnectException) {
                return new UpstreamFailure(CONNECTION_REFUSED, "the connection was refused");
            }
            if (current instanceof UnknownHostException) {
                return new UpstreamFailure(UNKNOWN, "the upstream's host name could not be resolved");
            }
            if (current instanceof SocketTimeoutException || current instanceof TimeoutException) {
                return new UpstreamFailure(TIMEOUT, "the upstream did not answer in time");
            }
        }
        return new UpstreamFailure(UNKNOWN, describe(failure));
    }

    /**
     * Whether this is "there is nobody to route to".
     *
     * <p>Spring Cloud's load balancer raises a plain {@link IllegalStateException} whose message
     * begins "No instances available for"; there is no exception type for it. The message is
     * matched because the alternative — reporting "no instance" for every {@code IllegalStateException}
     * — would be a worse lie.
     */
    private static boolean isNoInstance(Throwable current) {
        return current instanceof IllegalStateException
                && current.getMessage() != null
                && current.getMessage().startsWith("No instances available for");
    }

    /** The cause of a failure, or {@code null}. A failure that causes itself stops the walk. */
    private static Throwable causeOf(Throwable failure) {
        Throwable cause = failure.getCause();
        return cause == failure ? null : cause;
    }

    /** One exception, named: {@code "ClassName: message"}. */
    private static String describe(Throwable failure) {
        String message = failure.getMessage();
        return message == null || message.isBlank()
                ? failure.getClass().getSimpleName()
                : failure.getClass().getSimpleName() + ": " + message;
    }

    /** The whole chain, in one line: {@code "A: msg <- B: msg"}. */
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
}
