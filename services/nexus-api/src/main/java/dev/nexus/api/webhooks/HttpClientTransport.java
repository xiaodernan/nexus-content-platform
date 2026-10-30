package dev.nexus.api.webhooks;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * M10 v558 — the ONLY place this service POSTs to a stranger's server.
 *
 * <p>Java's own {@link HttpClient} (ADR 0011's stack, no new dependency). The client is built once: a
 * per-delivery client would leak a selector thread per subscription, and a webhook that costs a thread is a
 * webhook a subscriber is paying for.
 *
 * <p>The request carries the signed header and a content type. Redirects are NOT followed — a 3xx is reported
 * as the status it is, because following one would send a signed body to an address the subscriber did not
 * register, which is precisely the endpoint rule this service spends its subscription-time checks on.
 */
@Component
public class HttpClientTransport implements WebhookTransport {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public WebhookResponse post(String url, String body, Map<String, String> headers, Duration timeout)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .POST(HttpRequest.BodyPublishers.ofString(body));
        headers.forEach(request::header);
        HttpResponse<String> answer = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        return new WebhookResponse(answer.statusCode());
    }
}
