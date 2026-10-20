package dev.nexus.api.moderation;

/**
 * A desk request that breaks one of {@link ModerationService}'s rules.
 *
 * <p>Its own type rather than {@code IllegalArgumentException}, because the controller must answer 400 for
 * exactly these and 500 for anything else — the same split the social package's {@code InvalidReport}
 * makes.
 */
public class InvalidModeration extends RuntimeException {
    public InvalidModeration(String message) {
        super(message);
    }
}
