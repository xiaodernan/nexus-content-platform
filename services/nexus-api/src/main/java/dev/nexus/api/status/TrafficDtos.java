package dev.nexus.api.status;

/**
 * M9 — the wire shape of the traffic ledger: what this process has served since it started.
 *
 * <p>The status families are named, not numbered: a reader does not have to know that {@code 4xx} means
 * {@code clientErrors}. Every family count plus {@code unclassified} sums to {@code requests}, and the
 * five latency buckets sum to {@code requests} too — one record per request lands in exactly one family and
 * exactly one bucket, so the two partitions cannot disagree about the whole.
 *
 * <p>{@code durationTotalMs} is summed in nanoseconds and converted ONCE, so a thousand requests shorter than
 * one millisecond do not add up to zero. {@code durationMaxMs} is the longest single request, converted the
 * same way and therefore possibly {@code 0} when every request was faster than a millisecond.
 */
public final class TrafficDtos {

    private TrafficDtos() {
    }

    /**
     * The whole ledger at one instant. It is a SNAPSHOT: the read that asked for it is not in it, because a
     * request cannot be counted before it has ended.
     */
    public record Traffic(
            long requests,
            long successes,
            long redirects,
            long clientErrors,
            long serverErrors,
            long unclassified,
            long durationTotalMs,
            long durationMaxMs,
            Latency latency) {
    }

    /**
     * Five fixed buckets, inclusive at the top: a request of exactly {@code 10 ms} is {@code upTo10Ms}, and
     * only a request ABOVE the boundary falls into the next bucket. The edges are fixed so memory is five
     * counters rather than a map of observed durations.
     */
    public record Latency(
            long upTo10Ms,
            long upTo50Ms,
            long upTo250Ms,
            long upTo1000Ms,
            long over1000Ms) {
    }
}
