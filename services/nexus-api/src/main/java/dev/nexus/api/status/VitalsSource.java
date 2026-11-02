package dev.nexus.api.status;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import org.springframework.stereotype.Component;

/**
 * M9 — where the process's OWN numbers come from.
 *
 * <p>These are JDK facts, not service facts: the heap usage the memory bean reports, the thread counts the
 * thread bean reports, and the processors the runtime sees. Nothing here is cached and nothing here is
 * measured by this service — reading the bean IS the measurement.
 *
 * <p>The class exists so the vitals door can be graded without a real JVM bean: a test substitutes these
 * four readings and checks what the door does with them. The production bean is this class.
 */
@Component
public class VitalsSource {

    /** The heap's current usage. {@code max} may be {@code -1} when the JVM has no defined maximum. */
    public MemoryUsage heap() {
        return ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
    }

    /** The number of live threads, including daemon and non-daemon threads. */
    public int liveThreads() {
        return ManagementFactory.getThreadMXBean().getThreadCount();
    }

    /** The highest number of live threads since the JVM started (or since the peak was reset). */
    public int peakThreads() {
        return ManagementFactory.getThreadMXBean().getPeakThreadCount();
    }

    /** The number of processors available to this JVM, never less than one. */
    public int processors() {
        return Runtime.getRuntime().availableProcessors();
    }
}
