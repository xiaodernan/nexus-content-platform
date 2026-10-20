package dev.nexus.api.social;

/**
 * A tip request that breaks one of {@link TipService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else.
 */
public class InvalidTip extends RuntimeException {
    public InvalidTip(String message) {
        super(message);
    }
}
