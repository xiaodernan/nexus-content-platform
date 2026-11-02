package dev.nexus.api.status;

import java.lang.management.MemoryUsage;
import org.springframework.stereotype.Service;

/**
 * M9 — the process's own numbers, read once per call.
 *
 * <p>A vitals answer is a SAMPLE, not a history: every call asks the JDK beans for their values at that
 * moment and maps them to the wire shape. There is no cache, no rolling window, no percentile and no stored
 * counter — a second read is a second measurement, which is the only honest way to answer "how much heap is
 * this process using right now?".
 *
 * <p>{@code heapMaxBytes} is passed through as the JVM reports it, including {@code -1} when no maximum is
 * defined. Clamping it to zero would turn "undefined" into "empty", which is a different and false claim.
 */
@Service
public class VitalsService {

    private final VitalsSource source;

    public VitalsService(VitalsSource source) {
        this.source = source;
    }

    /** Read the beans now and return exactly what they say. */
    public HealthDtos.Vitals read() {
        MemoryUsage heap = source.heap();
        return new HealthDtos.Vitals(
                heap.getUsed(),
                heap.getCommitted(),
                heap.getMax(),
                source.liveThreads(),
                source.peakThreads(),
                source.processors());
    }
}
