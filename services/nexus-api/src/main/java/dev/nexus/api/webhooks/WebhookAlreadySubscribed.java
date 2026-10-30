package dev.nexus.api.webhooks;

/**
 * M10 v557 — the same subscriber already registered this endpoint. Translated to 409: the row is a duplicate
 * of a legal request, not an illegal one.
 *
 * <p>A second subscription to one URL would deliver every event twice, and a duplicate delivery is not two
 * facts — it is one fact a subscriber has to de-duplicate itself, without the receipt that would let it.
 */
public class WebhookAlreadySubscribed extends RuntimeException {

    public WebhookAlreadySubscribed(String message) {
        super(message);
    }
}
