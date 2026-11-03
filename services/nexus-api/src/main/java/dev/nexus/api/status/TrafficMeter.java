package dev.nexus.api.status;

import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/**
 * M9 — the traffic LEDGER: every request this process served, counted where it crossed the door.
 *
 * <p>This is the counter ADR 0037 said it was not: vitals samples the JVM, and this counts the service. The
 * shape is deliberately bounded — a handful of long counters, not a per-path map, a ring buffer or a
 * percentile sketch. Five latency buckets and five status families are all the memory a ledger gets.
 *
 * <p><b>One lock, two duties.</b> {@link #record(int, long)} and {@link #snapshot()} are both
 * {@code synchronized} on this component, so a snapshot is ONE instant rather than a walk over counters that
 * a concurrent request can straddle. The cost is a monitor acquisition per request; the benefit is an answer
 * whose partitions add up, which is the property a reader trusts. A lock-free set of adders would be faster
 * and could report a status total that disagrees with the bucket total by the requests in flight — this
 * ledger chooses the exact answer.
 *
 * <p>Durations are stored as nanoseconds and converted once at the snapshot; the wire's unit is milliseconds.
 * A negative duration (a clock that moved backwards between two {@code nanoTime} reads, which is not
 * possible in this JVM) is clamped to zero rather than counted as negative time.
 *
 * <p>Nothing is written and nothing is stored: the counters live in this process's heap and die with it. No
 * audit entry, no delivery, no table.
 */
@Component
public class TrafficMeter {

    private static final long NANOS_PER_MILLI = TimeUnit.MILLISECONDS.toNanos(1);
    private static final long TEN_MS = TimeUnit.MILLISECONDS.toNanos(10);
    private static final long FIFTY_MS = TimeUnit.MILLISECONDS.toNanos(50);
    private static final long TWO_FIFTY_MS = TimeUnit.MILLISECONDS.toNanos(250);
    private static final long ONE_THOUSAND_MS = TimeUnit.MILLISECONDS.toNanos(1000);

    private long requests;
    private long successes;
    private long redirects;
    private long clientErrors;
    private long serverErrors;
    private long unclassified;
    private long durationTotalNanos;
    private long durationMaxNanos;
    private long upTo10Ms;
    private long upTo50Ms;
    private long upTo250Ms;
    private long upTo1000Ms;
    private long over1000Ms;

    /**
     * Count ONE finished request. {@code status} is what the response carried when the dispatch ended, and
     * {@code durationNanos} is how long the dispatch took.
     */
    public synchronized void record(int status, long durationNanos) {
        long elapsed = Math.max(0L, durationNanos);
        requests++;
        if (status >= 200 && status < 300) {
            successes++;
        } else if (status >= 300 && status < 400) {
            redirects++;
        } else if (status >= 400 && status < 500) {
            clientErrors++;
        } else if (status >= 500 && status < 600) {
            serverErrors++;
        } else {
            // A status outside the four families is counted rather than dropped: the families must add up.
            unclassified++;
        }
        durationTotalNanos += elapsed;
        if (elapsed > durationMaxNanos) {
            durationMaxNanos = elapsed;
        }
        if (elapsed <= TEN_MS) {
            upTo10Ms++;
        } else if (elapsed <= FIFTY_MS) {
            upTo50Ms++;
        } else if (elapsed <= TWO_FIFTY_MS) {
            upTo250Ms++;
        } else if (elapsed <= ONE_THOUSAND_MS) {
            upTo1000Ms++;
        } else {
            over1000Ms++;
        }
    }

    /** The ledger at this instant. The request asking for it is not counted yet — it has not ended. */
    public synchronized TrafficDtos.Traffic snapshot() {
        return new TrafficDtos.Traffic(
                requests,
                successes,
                redirects,
                clientErrors,
                serverErrors,
                unclassified,
                durationTotalNanos / NANOS_PER_MILLI,
                durationMaxNanos / NANOS_PER_MILLI,
                new TrafficDtos.Latency(upTo10Ms, upTo50Ms, upTo250Ms, upTo1000Ms, over1000Ms));
    }
}
