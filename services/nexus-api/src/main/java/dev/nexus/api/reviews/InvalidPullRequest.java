package dev.nexus.api.reviews;

/**
 * M9 v868 — a review request that broke one of this service's rules. 400 {@code invalid-pull-request}, and
 * the message names the rule so a caller does not have to guess which field was fine.
 */
public class InvalidPullRequest extends RuntimeException {

    public InvalidPullRequest(String message) {
        super(message);
    }
}
