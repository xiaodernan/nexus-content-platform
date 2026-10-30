package dev.nexus.api.webhooks;

/**
 * M10 v557 — a request that broke one of the subscription rules. Translated to 400 by the controller, and
 * the message NAMES the rule: a caller told only "no" has to guess which field was fine.
 */
public class InvalidWebhook extends RuntimeException {

    public InvalidWebhook(String message) {
        super(message);
    }
}
