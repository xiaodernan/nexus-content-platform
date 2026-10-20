package dev.nexus.api.social;

/**
 * A plan or subscription request that breaks one of {@link SubscriptionService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else.
 */
public class InvalidSubscription extends RuntimeException {
    public InvalidSubscription(String message) {
        super(message);
    }
}
