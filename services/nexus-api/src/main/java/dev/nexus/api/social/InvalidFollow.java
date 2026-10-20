package dev.nexus.api.social;

/**
 * A follow request that breaks one of {@link FollowService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else.
 */
public class InvalidFollow extends RuntimeException {
    public InvalidFollow(String message) {
        super(message);
    }
}
