package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * M9 — the traffic ledger's counting rules: five status families and five latency buckets, both partitions
 * adding up to the whole, durations summed before they are converted, and a snapshot that changes nothing.
 */
class TrafficMeterTest {

    private static final long MS = TimeUnit.MILLISECONDS.toNanos(1);
    private static final long TEN_MS = TimeUnit.MILLISECONDS.toNanos(10);
    private static final long FIFTY_MS = TimeUnit.MILLISECONDS.toNanos(50);
    private static final long TWO_FIFTY_MS = TimeUnit.MILLISECONDS.toNanos(250);
    private static final long ONE_THOUSAND_MS = TimeUnit.MILLISECONDS.toNanos(1000);

    private final TrafficMeter meter = new TrafficMeter();

    @Test
    void anEmptyLedgerIsAllZeros() {
        TrafficDtos.Traffic traffic = meter.snapshot();

        assertThat(traffic.requests()).isZero();
        assertThat(traffic.successes()).isZero();
        assertThat(traffic.redirects()).isZero();
        assertThat(traffic.clientErrors()).isZero();
        assertThat(traffic.serverErrors()).isZero();
        assertThat(traffic.unclassified()).isZero();
        assertThat(traffic.durationTotalMs()).isZero();
        assertThat(traffic.durationMaxMs()).isZero();
        assertThat(traffic.latency()).isEqualTo(new TrafficDtos.Latency(0, 0, 0, 0, 0));
    }

    @Test
    void statusFamiliesAreCountedByTheirHundreds() {
        meter.record(200, 0);
        meter.record(204, 0);
        meter.record(301, 0);
        meter.record(404, 0);
        meter.record(500, 0);
        meter.record(199, 0);

        TrafficDtos.Traffic traffic = meter.snapshot();

        assertThat(traffic.requests()).isEqualTo(6);
        assertThat(traffic.successes()).isEqualTo(2);
        assertThat(traffic.redirects()).isEqualTo(1);
        assertThat(traffic.clientErrors()).isEqualTo(1);
        assertThat(traffic.serverErrors()).isEqualTo(1);
        assertThat(traffic.unclassified()).isEqualTo(1);
        assertThat(familyTotal(traffic)).isEqualTo(traffic.requests());
    }

    @Test
    void latencyBucketsAreInclusiveAtTheirUpperBoundAndExclusiveAboveIt() {
        meter.record(200, TEN_MS);
        meter.record(200, TEN_MS + 1);
        meter.record(200, FIFTY_MS);
        meter.record(200, FIFTY_MS + 1);
        meter.record(200, TWO_FIFTY_MS);
        meter.record(200, TWO_FIFTY_MS + 1);
        meter.record(200, ONE_THOUSAND_MS);
        meter.record(200, ONE_THOUSAND_MS + 1);

        TrafficDtos.Traffic traffic = meter.snapshot();

        assertThat(traffic.requests()).isEqualTo(8);
        assertThat(traffic.latency().upTo10Ms()).isEqualTo(1);
        assertThat(traffic.latency().upTo50Ms()).isEqualTo(2);
        assertThat(traffic.latency().upTo250Ms()).isEqualTo(2);
        assertThat(traffic.latency().upTo1000Ms()).isEqualTo(2);
        assertThat(traffic.latency().over1000Ms()).isEqualTo(1);
        assertThat(bucketTotal(traffic)).isEqualTo(traffic.requests());
    }

    @Test
    void durationsAreSummedInNanosAndConvertedOnce() {
        meter.record(200, 400_000L);
        meter.record(200, 400_000L);
        meter.record(200, 400_000L);

        TrafficDtos.Traffic traffic = meter.snapshot();

        // Three requests shorter than one millisecond total 1.2 ms: summed first, then converted, so they
        // are not rounded away one at a time.
        assertThat(traffic.durationTotalMs()).isEqualTo(1);
        assertThat(traffic.durationMaxMs()).isZero();
    }

    @Test
    void theLongestRequestIsTheMaximum() {
        meter.record(200, 5 * MS);
        meter.record(200, 40 * MS);
        meter.record(200, 2 * MS);

        TrafficDtos.Traffic traffic = meter.snapshot();

        assertThat(traffic.durationTotalMs()).isEqualTo(47);
        assertThat(traffic.durationMaxMs()).isEqualTo(40);
    }

    @Test
    void aNegativeDurationIsClampedToZeroRatherThanCountedAsNegativeTime() {
        meter.record(200, -1L);

        TrafficDtos.Traffic traffic = meter.snapshot();

        assertThat(traffic.requests()).isEqualTo(1);
        assertThat(traffic.durationTotalMs()).isZero();
        assertThat(traffic.durationMaxMs()).isZero();
        assertThat(traffic.latency().upTo10Ms()).isEqualTo(1);
        assertThat(bucketTotal(traffic)).isEqualTo(1);
    }

    @Test
    void aSnapshotDoesNotChangeTheLedger() {
        meter.record(200, 5 * MS);
        TrafficDtos.Traffic first = meter.snapshot();
        assertThat(first.requests()).isEqualTo(1);

        meter.record(404, 5 * MS);
        TrafficDtos.Traffic second = meter.snapshot();

        assertThat(first.requests()).as("the earlier snapshot is a value, not a live view").isEqualTo(1);
        assertThat(first.clientErrors()).isZero();
        assertThat(second.requests()).isEqualTo(2);
        assertThat(second.clientErrors()).isEqualTo(1);
    }

    private static long familyTotal(TrafficDtos.Traffic traffic) {
        return traffic.successes() + traffic.redirects() + traffic.clientErrors() + traffic.serverErrors()
                + traffic.unclassified();
    }

    private static long bucketTotal(TrafficDtos.Traffic traffic) {
        TrafficDtos.Latency latency = traffic.latency();
        return latency.upTo10Ms() + latency.upTo50Ms() + latency.upTo250Ms() + latency.upTo1000Ms()
                + latency.over1000Ms();
    }
}
