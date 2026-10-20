package dev.nexus.api.social;

/**
 * A like request that breaks one of {@link LikeService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else. A service that threw a generic exception would make every
 * programming error look like a caller's mistake.
 */
public class InvalidLike extends RuntimeException {
    public InvalidLike(String message) {
        super(message);
    }
}
