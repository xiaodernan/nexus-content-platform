package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * M9 — the filter is the only place a request is counted: the status the response carried decides the
 * family, a thrown dispatch is counted as 500, and the exception still reaches the container.
 */
class TrafficFilterTest {

    private final TrafficMeter meter = new TrafficMeter();
    private final TrafficFilter filter = new TrafficFilter(meter);

    @Test
    void anOrdinaryTwoHundredIsCountedAsOneSuccess() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest("GET", "/health/live"), response, new MockFilterChain());

        TrafficDtos.Traffic traffic = meter.snapshot();
        assertThat(traffic.requests()).isEqualTo(1);
        assertThat(traffic.successes()).isEqualTo(1);
        assertThat(traffic.latency().upTo10Ms()).isEqualTo(1);
    }

    @Test
    void aFrameworkProducedFourOhFourIsCountedInTheClientFamily() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (request, answer) -> ((MockHttpServletResponse) answer).setStatus(404);

        filter.doFilter(new MockHttpServletRequest("GET", "/no-such-door"), response, chain);

        TrafficDtos.Traffic traffic = meter.snapshot();
        assertThat(traffic.requests()).isEqualTo(1);
        assertThat(traffic.clientErrors()).isEqualTo(1);
        assertThat(traffic.successes()).isZero();
    }

    @Test
    void aFiveHundredWrittenByTheHandlerIsCountedInTheServerFamily() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (request, answer) -> ((MockHttpServletResponse) answer).setStatus(503);

        filter.doFilter(new MockHttpServletRequest("GET", "/health/ready"), response, chain);

        assertThat(meter.snapshot().serverErrors()).isEqualTo(1);
        assertThat(meter.snapshot().clientErrors()).isZero();
    }

    @Test
    void aThrownServletExceptionIsCountedAsFiveHundredAndStillReachesTheContainer() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (request, answer) -> {
            throw new ServletException("the dispatch failed");
        };

        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest("GET", "/door"), response, chain))
                .isInstanceOf(ServletException.class);

        TrafficDtos.Traffic traffic = meter.snapshot();
        assertThat(traffic.requests()).isEqualTo(1);
        assertThat(traffic.serverErrors()).isEqualTo(1);
    }

    @Test
    void aThrownRuntimeExceptionIsCountedAsFiveHundredAndStillReachesTheContainer() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (request, answer) -> {
            throw new IllegalStateException("the handler failed");
        };

        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest("GET", "/door"), response, chain))
                .isInstanceOf(IllegalStateException.class);

        assertThat(meter.snapshot().serverErrors()).isEqualTo(1);
        assertThat(meter.snapshot().successes()).isZero();
    }
}
