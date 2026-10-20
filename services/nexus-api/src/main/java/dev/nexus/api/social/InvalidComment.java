package dev.nexus.api.social;

/**
 * A comment request that breaks one of {@link CommentService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else.
 */
public class InvalidComment extends RuntimeException {
    public InvalidComment(String message) {
        super(message);
    }
}
