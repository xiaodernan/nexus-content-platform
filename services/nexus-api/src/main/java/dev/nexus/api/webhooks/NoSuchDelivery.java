package dev.nexus.api.webhooks;

/**
 * M10 v563 — a receipt id that names nothing.
 *
 * <p>The redelivery door's subject is a RECEIPT: a caller points at a row the log already holds and asks this
 * service to repeat it. An id that names no row is a 404 rather than an attempt — "there is nothing to
 * repeat" is a different fact from "the endpoint refused it", the same distinction the ping door makes for a
 * subscription that does not exist.
 */
public class NoSuchDelivery extends RuntimeException {

    public NoSuchDelivery(String message) {
        super(message);
    }
}
