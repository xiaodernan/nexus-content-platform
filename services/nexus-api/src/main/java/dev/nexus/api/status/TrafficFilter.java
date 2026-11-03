package dev.nexus.api.status;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * M9 — the one place a request is COUNTED: it wraps the dispatch, reads the status the response actually
 * carried, and hands both the status and the elapsed nanoseconds to {@link TrafficMeter}.
 *
 * <p>It counts every request, including the reads of {@code /health/traffic} itself. The snapshot those reads
 * answer is taken BEFORE this filter records them, so a traffic answer does not contain the request that
 * asked for it; the NEXT answer does. That is not an off-by-one to fix — a request cannot be counted before
 * it has ended, and pretending otherwise would make the ledger a prediction.
 *
 * <p><b>Failures are 5xx.</strong> When the dispatch throws, the container will answer 500, but this filter
 * sees the throw before that status is set. It therefore records 500 itself and rethrows, so a failed request
 * is counted exactly once and in the family an operator would look for.
 *
 * <p>{@code OncePerRequestFilter} keeps the count at one per request when the container re-dispatches (an
 * include or a forward); error dispatches are not filtered by default, so the container's {@code /error}
 * handling does not add a second record for the same request.
 *
 * <p>A servlet filter is not a Spring interceptor: it wraps handling that happens before and after MVC, so a
 * 404 produced by the framework and a 500 produced by a thrown exception are both seen. The cost is stated:
 * one monitor acquisition in {@link TrafficMeter#record}, and a {@code System.nanoTime()} pair per request.
 */
@Component
public class TrafficFilter extends OncePerRequestFilter {

    private final TrafficMeter meter;

    public TrafficFilter(TrafficMeter meter) {
        this.meter = meter;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        long began = System.nanoTime();
        boolean failed = false;
        try {
            chain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException e) {
            failed = true;
            throw e;
        } catch (Error e) {
            failed = true;
            throw e;
        } finally {
            int status = failed ? 500 : response.getStatus();
            meter.record(status, System.nanoTime() - began);
        }
    }
}
