package dev.nexus.gateway.ratelimit;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * v657 — what the edge does when its rate limiter CANNOT COUNT.
 *
 * <p>One knob, because the alternative was worse. The rejected design was a mode switch
 * (`allow` / `refuse`): refusing every request because a counter is unreachable hands an outage to
 * the edge and takes the whole API down with it, and a 429 in that state would be a LIE — a 429 says
 * "you are over the limit", which is a statement about the CALLER, and the edge has not counted
 * anything. So the edge admits the request and NAMES the degradation in a response header
 * ({@code X-Nexus-RateLimit: unavailable}) and in a counter; an operator who wants the opposite
 * policy turns the limiter off at the route rather than teaching it to lie.
 *
 * <p>{@code warn-interval} is how often the failure is allowed to reach the log. Measured reasoning:
 * during a Redis outage every request takes this path, so an unthrottled WARN is a log flood that
 * buries the outage it is reporting. The counter is per request and the log is throttled; neither
 * replaces the other (a counter cannot be grepped for the exception, and a log cannot be alerted on).
 */
@ConfigurationProperties("nexus.edge.rate-limit")
public record RateLimitProperties(Duration warnInterval) {

    public RateLimitProperties {
        if (warnInterval == null) {
            warnInterval = Duration.ofSeconds(10);
        }
    }
}
