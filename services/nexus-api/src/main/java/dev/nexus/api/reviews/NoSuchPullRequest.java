package dev.nexus.api.reviews;

/**
 * M9 v868 — an id that names no review request. 404 {@code unknown-pull-request}.
 */
public class NoSuchPullRequest extends RuntimeException {

    public NoSuchPullRequest(String message) {
        super(message);
    }
}
