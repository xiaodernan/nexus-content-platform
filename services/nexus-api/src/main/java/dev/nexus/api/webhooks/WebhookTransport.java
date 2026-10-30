package dev.nexus.api.webhooks;

import java.time.Duration;
import java.util.Map;

/**
 * M10 v558 — the seam between the dispatcher's DECISIONS and the network that carries them.
 *
 * <p>The dispatcher decides WHO is called, WHAT the bytes are and whether the endpoint is allowed to be
 * called at all; this interface is the one place a POST actually happens. A seam rather than a hard-wired
 * client for the same reason the runtime's exec and build doors have one: a decision that can only be
 * graded by touching a stranger's server is a decision that is not graded.
 */
public interface WebhookTransport {

    /**
     * POST one body to one endpoint.
     *
     * @param headers the headers the delivery carries, signature included
     * @return the endpoint's status; a non-2xx is an ANSWER, not an exception
     * @throws Exception when nothing answered — DNS, connect, TLS, timeout. The dispatcher classifies it
     */
    WebhookResponse post(String url, String body, Map<String, String> headers, Duration timeout) throws Exception;

    /** What an endpoint answered: the status, and nothing else this build reads. */
    record WebhookResponse(int status) {
    }
}
