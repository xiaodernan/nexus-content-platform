package dev.nexus.api.webhooks;

/**
 * M10 v558 — there is no such subscription. 404, because a ping to an id that names nothing is a delivery
 * request about a row that does not exist: a 200 with {@code delivered:false} would read as "the endpoint
 * refused", which is a different fact.
 */
public class NoSuchWebhook extends RuntimeException {

    public NoSuchWebhook(String message) {
        super(message);
    }
}
