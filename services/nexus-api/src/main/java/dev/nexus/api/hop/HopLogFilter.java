package dev.nexus.api.hop;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * v656 — the hop ANNOUNCES the request it served, so the trace id it was given can be read at 03:00.
 *
 * <p><b>Why this class exists at all.</b> A tracing bridge puts the correlation ids in the MDC and
 * the logging pattern prints them (`[app,traceId,spanId]`) — but only on lines that are WRITTEN.
 * nexus-api wrote per-request lines only when something went wrong (a breaker opened, a read came
 * back empty), so a healthy request had no line at all. An operator with an id from a slow request
 * then finds the id in a failure line and nowhere else, which reads like "the id only exists on
 * errors". It does not; the line was never written.
 *
 * <p><b>What is deliberately NOT here.</b> This class does not read, mint, or pass a trace id. The
 * ids in these lines are whatever the server observation scoped for this request — the class exists
 * to give the scope a line to appear on, and a class that copied the id into a string would prove
 * only that it can concatenate.
 *
 * <p><b>Order.</b> {@link Ordered#LOWEST_PRECEDENCE}: Boot registers the observation filter at the
 * very top of the chain, so the innermost position is the one where the scope is certainly open.
 *
 * <p><b>Cost.</b> Two INFO lines per request (received, answered). That is the price of a hop that
 * can be found in a log; a deployment that finds it too loud lowers `dev.nexus` to WARN and loses the
 * traceability with it, which is a trade an operator should make deliberately and not by accident.
 *
 * <p>The same class exists in {@code java-gateway} (a reactive global filter) and
 * {@code java-domain-service}. Three copies and not one shared module: three independently
 * deployable services with three separate Maven builds.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class HopLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(HopLogFilter.class);

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String method = request.getMethod();
        String path = request.getRequestURI();
        long began = System.nanoTime();
        log.info("hop api received {} {}", method, path);
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
            // A thrown dispatch is answered 500 by the container after this filter has returned, so
            // the status is recorded here as the same 500 an operator will see on the wire.
            int status = failed ? 500 : response.getStatus();
            log.info("hop api answered {} {} -> {} in {} ms",
                    method, path, status, (System.nanoTime() - began) / 1_000_000);
        }
    }
}
