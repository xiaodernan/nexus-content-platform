package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.management.MemoryUsage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * M9 — the vitals mapping, graded without a JVM bean.
 *
 * <p>The load-bearing cases: the numbers are passed through unchanged, an undefined maximum stays
 * {@code -1} (it must not become zero), and two reads are two samples of the source rather than one
 * cached answer.
 */
@ExtendWith(MockitoExtension.class)
class VitalsServiceTest {

    @Mock
    private VitalsSource source;

    @Test
    void theJvmsNumbersArePassedThroughUnchanged() {
        when(source.heap()).thenReturn(new MemoryUsage(0L, 100L, 200L, 400L));
        when(source.liveThreads()).thenReturn(17);
        when(source.peakThreads()).thenReturn(19);
        when(source.processors()).thenReturn(8);

        HealthDtos.Vitals vitals = new VitalsService(source).read();

        assertThat(vitals.heapUsedBytes()).isEqualTo(100L);
        assertThat(vitals.heapCommittedBytes()).isEqualTo(200L);
        assertThat(vitals.heapMaxBytes()).isEqualTo(400L);
        assertThat(vitals.liveThreads()).isEqualTo(17);
        assertThat(vitals.peakThreads()).isEqualTo(19);
        assertThat(vitals.processors()).isEqualTo(8);
    }

    @Test
    void anUndefinedHeapMaximumStaysMinusOneRatherThanBecomingZero() {
        // MemoryUsage reports -1 when the JVM has no defined maximum; clamping it would claim "no heap".
        when(source.heap()).thenReturn(new MemoryUsage(0L, 100L, 200L, -1L));
        when(source.liveThreads()).thenReturn(1);
        when(source.peakThreads()).thenReturn(1);
        when(source.processors()).thenReturn(1);

        HealthDtos.Vitals vitals = new VitalsService(source).read();

        assertThat(vitals.heapMaxBytes()).isEqualTo(-1L);
    }

    @Test
    void everyReadIsANewSampleAndTheSourceIsAskedAgain() {
        when(source.heap()).thenReturn(
                new MemoryUsage(0L, 10L, 20L, 30L),
                new MemoryUsage(0L, 11L, 21L, 31L));
        when(source.liveThreads()).thenReturn(5);
        when(source.peakThreads()).thenReturn(6);
        when(source.processors()).thenReturn(4);
        VitalsService service = new VitalsService(source);

        assertThat(service.read().heapUsedBytes()).isEqualTo(10L);
        assertThat(service.read().heapUsedBytes()).isEqualTo(11L);
        verify(source, times(2)).heap();
    }
}
