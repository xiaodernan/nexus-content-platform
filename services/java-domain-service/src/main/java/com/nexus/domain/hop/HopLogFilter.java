package com.nexus.domain.hop;

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
 * This service wrote exactly one line per process ("listening on port") and none per request, so an
 * id minted at the edge and carried here through Feign had nowhere to land: the hop that did the
 * actual database work was the one hop a log could not show.
 *
 * <p><b>What is deliberately NOT here.</b> This class does not read the incoming `traceparent`, mint
 * an id, or pass one along. The ids in these lines are whatever the server observation scoped for
 * this request — the class exists to give the scope a line to appear on.
 *
 * <p><b>Order.</b> {@link Ordered#LOWEST_PRECEDENCE}: Boot registers the observation filter at the
 * very top of the chain, so the innermost position is the one where the scope is certainly open.
 *
 * <p>The same class exists in {@code java-gateway} (a reactive global filter) and {@code nexus-api}.
 * Three copies and not one shared module: three independently deployable services with three
 * separate Maven builds, and a shared jar between them would be a fourth thing to version.
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
        log.info("hop domain received {} {}", method, path);
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
            log.info("hop domain answered {} {} -> {} in {} ms",
                    method, path, status, (System.nanoTime() - began) / 1_000_000);
        }
    }
}
