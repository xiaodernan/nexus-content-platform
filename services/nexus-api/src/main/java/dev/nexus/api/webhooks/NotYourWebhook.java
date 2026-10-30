package dev.nexus.api.webhooks;

/**
 * M10 v557 — somebody else's subscription. Translated to 403: the request was well-formed, so a 400 would
 * tell the caller to fix a field that is fine.
 */
public class NotYourWebhook extends RuntimeException {

    public NotYourWebhook(String message) {
        super(message);
    }
}
