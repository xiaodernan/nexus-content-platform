package dev.nexus.api.webhooks;

import java.net.InetAddress;
import java.util.List;

/**
 * M10 v558 — the RESOLUTION seam, and the second half of the endpoint rule ADR 0021 left open.
 *
 * <p>A subscription-time check can judge a LITERAL host and nothing else: {@code https://rebind.example}
 * passes every rule in {@link WebhookService} and may resolve to {@code 127.0.0.1} when the delivery is
 * actually made. That is the DNS-rebinding shape, and the dispatcher cannot close it without asking what a
 * name means at the moment it is used. This interface is that question, and the answer is a list because one
 * name can answer several addresses — every one of them has to pass, not the first.
 */
public interface HostResolver {

    /** Every address the host names right now. Throws when it names none. */
    List<InetAddress> resolve(String host) throws Exception;
}
